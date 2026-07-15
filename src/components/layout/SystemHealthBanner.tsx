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

  const disconnected = whatsapp?.connected === false;
  if (!disconnected && failedCount === 0) return null;

  if (disconnected) {
    return (
      <div className="w-full bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-3 text-sm">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong>WhatsApp desconectado</strong> — mensagens não estão sendo enviadas.
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="h-7"
          onClick={() => navigate("/whatsapp")}
        >
          Reconectar
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2 flex items-center gap-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <strong>{failedCount}</strong> mensagem(ns) falharam nas últimas 24h.
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="h-7"
        onClick={() => navigate("/mensagens-agendadas")}
      >
        Ver
      </Button>
    </div>
  );
}
