import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Banner e menu compartilham a mesma consulta (mesma chave de cache).
// Falha de consulta e estado transitório não comprovam desconexão; só "close" é desconexão confirmada.
export function useWhatsAppHealth() {
  const { data: state, isError } = useQuery({
    queryKey: ["whatsapp-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-status", { body: { action: "status" } });
      if (error) throw error;
      const state = (data as { state?: unknown } | null)?.state;
      if (typeof state !== "string") throw new Error("Status do WhatsApp inválido.");
      return state;
    },
    retry: 1,
    refetchInterval: 120000,
    staleTime: 60000,
  });
  return {
    state,
    disconnected: state === "close",
    reconnecting: state === "connecting",
    unverified: isError || state === "unknown",
    connected: state === "open",
  };
}
