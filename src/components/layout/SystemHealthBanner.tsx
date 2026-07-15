import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, WifiOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Auto-hide after this many ms; dismissal also persists in sessionStorage
const AUTO_HIDE_MS = 15000;

export function SystemHealthBanner() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("banner-dismissed") || "{}");
    } catch {
      return {};
    }
  });

  const dismiss = (key: string) => {
    const next = { ...dismissed, [key]: true };
    setDismissed(next);
    sessionStorage.setItem("banner-dismissed", JSON.stringify(next));
  };

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
  const showDisconnected = disconnected && !dismissed["whatsapp"];
  const showFailed = !disconnected && failedCount > 0 && !dismissed["failed"];

  // Auto-hide timer
  useEffect(() => {
    if (!showDisconnected && !showFailed) return;
    const key = showDisconnected ? "whatsapp" : "failed";
    const t = setTimeout(() => dismiss(key), AUTO_HIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDisconnected, showFailed]);

  if (!showDisconnected && !showFailed) return null;

  if (showDisconnected) {
    return (
      <div className="w-full bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong>WhatsApp desconectado</strong> — mensagens não estão sendo enviadas.
        </span>
        <Button size="sm" variant="secondary" className="h-7" onClick={() => navigate("/whatsapp")}>
          Reconectar
        </Button>
        <button
          onClick={() => dismiss("whatsapp")}
          className="p-1 rounded hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <strong>{failedCount}</strong> mensagem(ns) falharam nas últimas 24h.
      </span>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => navigate("/mensagens-agendadas")}>
        Ver
      </Button>
      <button
        onClick={() => dismiss("failed")}
        className="p-1 rounded hover:bg-white/20 transition-colors"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
