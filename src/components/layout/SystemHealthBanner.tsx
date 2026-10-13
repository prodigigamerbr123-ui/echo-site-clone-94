import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function SystemHealthBanner() {
  const navigate = useNavigate();

  const { data: whatsapp } = useQuery({
    queryKey: ["whatsapp-health"],
    queryFn: async () => {
      try {
        const { data } = await supabase.functions.invoke("whatsapp-status");
        return data as { connected?: boolean };
      } catch {
        return { connected: false };
      }
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: failedCount = 0 } = useQuery({
    queryKey: ["failed-24h"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("updated_at", since);
      return count || 0;
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: automationRun, error: automationError } = useQuery({
    queryKey: ["automation-global-health"],
    queryFn: async () => {
      const { data, error } = await supabase.from("automation_runs")
        .select("started_at, status")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: overdueQueue = 0, error: overdueQueueError } = useQuery({
    queryKey: ["automation-overdue-queue"],
    queryFn: async () => {
      const { count, error } = await supabase.from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending").lt("scheduled_for", new Date(Date.now() - 5 * 60000).toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 120000,
  });

  const disconnected = whatsapp?.connected === false;
  const staleAutomation = automationRun && Date.now() - new Date(automationRun.started_at).getTime() > 26 * 3600000;
  const stuckAutomation = automationRun?.status === "running" && Date.now() - new Date(automationRun.started_at).getTime() > 20 * 60000;
  const automationIssue = !!(automationError || automationRun === null || automationRun?.status === "failed" || staleAutomation || stuckAutomation);

  if (!disconnected && failedCount === 0 && !automationIssue && !overdueQueueError && overdueQueue === 0) return null;

  if (disconnected) {
    return (
      <div className="w-full bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong>WhatsApp desconectado</strong> — mensagens não estão sendo enviadas.
        </span>
        <Button size="sm" variant="secondary" className="h-7" onClick={() => navigate("/whatsapp")}>
          Reconectar
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {failedCount > 0 && <span><strong>{failedCount}</strong> mensagem(ns) falharam nas últimas 24h. </span>}
        {overdueQueue > 0 && <span><strong>{overdueQueue}</strong> mensagem(ns) atrasadas. </span>}
        {overdueQueueError && <span>Não foi possível consultar a fila. </span>}
        {automationIssue && <span>Motor de automações requer atenção.</span>}
      </span>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => navigate(automationIssue ? "/automacoes" : "/caixa-de-saida")}>
        Ver
      </Button>
    </div>
  );
}
