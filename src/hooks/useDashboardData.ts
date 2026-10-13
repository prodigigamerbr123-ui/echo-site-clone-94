import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDateISOSP } from "@/lib/spTime";
import { dashboardSnapshot, type DashboardSnapshot } from "../../supabase/functions/_shared/dashboardContracts";

function useDashboardSnapshot<T>(select: (snapshot: DashboardSnapshot) => T) {
  const { user, role, loading, roleLoading } = useAuth();
  return useQuery({
    queryKey: ["dashboard-stats", user?.id, role, fmtDateISOSP(new Date())],
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
