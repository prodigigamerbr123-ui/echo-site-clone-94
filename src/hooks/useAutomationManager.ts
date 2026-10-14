import { supabase } from "@/integrations/supabase/client";
import { automationTemplates, fetchAutomationSettings, type AutomationParams } from "@/lib/automationSettings";
import { fetchAutomationTemplateIds } from "@/lib/automationTemplateIds";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ALL_AUTO_TYPES, type PredefinedMsg } from "@/lib/automationCatalog";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function updateAutomationSetting(
  key: string,
  values: { enabled?: boolean; params?: AutomationParams },
) {
  const { data, error } = await supabase
    .from("automation_settings")
    .update(values)
    .eq("key", key)
    .select("key")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`A automação ${key} não foi encontrada no banco. A atualização não foi salva.`);
}

export function useAutomationManager() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["automation-settings"],
    queryFn: fetchAutomationSettings,
  });

  const { data: predefined = [] } = useQuery<PredefinedMsg[]>({
    queryKey: ["predefined-messages", "automation-only"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predefined_messages")
        .select("id, title, content")
        .order("title");
      if (error) throw error;
      const automationIds = await fetchAutomationTemplateIds();
      return (data ?? []).filter((p: PredefinedMsg) => automationIds.has(p.id)) as PredefinedMsg[];
    },
  });

  const { data: runHistory, error: runHistoryError } = useQuery({
    queryKey: ["automation-run-history"],
    queryFn: async () => {
      const [latest, lastSuccess] = await Promise.all([
        supabase.from("automation_runs")
          .select("id, started_at, finished_at, status, error_message, summary")
          .order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("automation_runs")
          .select("id, finished_at").eq("status", "success")
          .order("finished_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (latest.error) throw latest.error;
      if (lastSuccess.error) throw lastSuccess.error;
      return { latest: latest.data, lastSuccess: lastSuccess.data };
    },
    refetchInterval: 60000,
  });

  const { data: overdueQueue = 0, error: overdueQueueError } = useQuery({
    queryKey: ["automation-overdue-queue"],
    queryFn: async () => {
      const { count, error } = await supabase.from("scheduled_messages")
        .select("id", { head: true, count: "exact" })
        .eq("status", "pending").lt("scheduled_for", new Date(Date.now() - 5 * 60000).toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const latestRun = runHistory?.latest;
  const lastSuccess = runHistory?.lastSuccess;
  const lastStartMs = latestRun ? new Date(latestRun.started_at).getTime() : 0;
  const runningTooLong = latestRun?.status === "running" && Date.now() - lastStartMs > 20 * 60000;
  const cronOverdue = lastStartMs > 0 && Date.now() - lastStartMs > 26 * 3600000;
  const unhealthy = runHistoryError || overdueQueueError || (runHistory && !latestRun) || latestRun?.status === "failed" || runningTooLong || cronOverdue || overdueQueue > 0;

  const { data: monthCount } = useQuery({
    queryKey: ["automation-month-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .in("message_type", ALL_AUTO_TYPES)
        .gte("created_at", startOfMonth());
      return count ?? 0;
    },
  });

  const { data: last30Count } = useQuery({
    queryKey: ["automation-30d-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .in("message_type", ALL_AUTO_TYPES)
        .gte("created_at", daysAgoISO(30));
      return count ?? 0;
    },
  });

  const { data: perTypeCounts } = useQuery({
    queryKey: ["automation-per-type-30d"],
    queryFn: async () => {
      const data = await fetchAllPages((from, to) => supabase
        .from("scheduled_messages").select("message_type", { count: "exact" })
        .in("message_type", ALL_AUTO_TYPES)
        .gte("created_at", daysAgoISO(30)).order("id").range(from, to));
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.message_type] = (counts[row.message_type] ?? 0) + 1;
      }
      return counts;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      await updateAutomationSetting(key, { enabled });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Automação atualizada");
    },
    onError: (e) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const paramsMutation = useMutation({
    mutationFn: async ({ key, params }: { key: string; params: AutomationParams }) => {
      await updateAutomationSetting(key, { params });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Configuração salva");
    },
    onError: (e) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const templateMutation = useMutation({
    mutationFn: async ({
      key, messageType, predefinedId,
    }: { key: string; messageType: string; predefinedId: string | null }) => {
      const current = settings?.[key]?.params ?? {};
      const templates = automationTemplates(current);
      if (predefinedId) templates[messageType] = predefinedId;
      else delete templates[messageType];
      const newParams = { ...current, templates };
      await updateAutomationSetting(key, { params: newParams });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
      toast.success("Mensagem vinculada");
    },
    onError: (e) => toast.error(e.message ?? "Erro ao vincular"),
  });

  return {
    settings, predefined, latestRun, lastSuccess, runHistory, runHistoryError,
    overdueQueue, overdueQueueError, runningTooLong, cronOverdue, unhealthy,
    monthCount, last30Count, perTypeCounts, toggleMutation, paramsMutation, templateMutation,
  };
}
