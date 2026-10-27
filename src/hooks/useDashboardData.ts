import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDateISOSP } from "@/lib/spTime";
import { useAgendaClock } from "@/hooks/useAgendaClock";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";
import { dashboardSnapshot, type DashboardSnapshot } from "../../supabase/functions/_shared/dashboardContracts";

function useDashboardSnapshot<T>(select: (snapshot: DashboardSnapshot) => T) {
  const { user, role, loading, roleLoading } = useAuth();
  const now = useAgendaClock();
  return useQuery({
    queryKey: ["dashboard-stats", user?.id, role, fmtDateISOSP(new Date(now))],
    enabled: !!user && !!role && !loading && !roleLoading,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_workout_dashboard");
      if (error) throw error;
      return dashboardSnapshot(data);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    select,
  });
}

const selectStats = (snapshot: DashboardSnapshot) => snapshot.stats;
const selectActions = (snapshot: DashboardSnapshot) => snapshot.actions;
export const useDashboardStats = () => useDashboardSnapshot(selectStats);
export const useTodayActions = () => useDashboardSnapshot(selectActions);
const selectSnapshot = (snapshot: DashboardSnapshot) => snapshot;
export const useDailyWork = () => useDashboardSnapshot(selectSnapshot);

export function useDeliveryIssues() {
  const { user, role, loading, roleLoading } = useAuth();
  return useQuery({
    queryKey: ["dashboard-delivery-issues", user?.id, role],
    enabled: !!user && hasRole(role, FRONT_DESK) && !loading && !roleLoading,
    queryFn: async () => {
      const { count, error } = await supabase.from("scheduled_messages")
        .select("id", { head: true, count: "exact" }).eq("status", "failed");
      if (error) throw error;
      if (count === null) throw new Error("Não foi possível confirmar as falhas de mensagem.");
      return count;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
