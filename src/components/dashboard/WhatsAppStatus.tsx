import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Smartphone,
  AlertTriangle,
} from "lucide-react";

type State = "open" | "close" | "connecting" | "unknown" | string;

interface StatusResponse {
  state: State;
  connected?: boolean;
  instance?: string;
  error?: string;
}

export function WhatsAppStatus() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatusResponse | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(
    async () => {
      setLoading(true);
      try {
        const { data: resp, error } = await supabase.functions.invoke("whatsapp-status", {
          body: { action: "status" },
        });
        if (error) throw error;
        setData(resp as StatusResponse);
      } catch (err: any) {
        toast({
          title: "Erro ao consultar WhatsApp",
          description: err?.message || "Tente novamente",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const stateRef = useRef<string | undefined>(data?.state);
  useEffect(() => { stateRef.current = data?.state; }, [data?.state]);

  useEffect(() => {
    fetchStatus();
    // Intervalo fixo curto; pula fetch quando já está conectado (evita recriar timer a cada oscilação)
    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      // Se conectado, só refetch a cada 6 ciclos (~60s); senão a cada ciclo (~10s)
      if (stateRef.current === "open" && tick % 6 !== 0) return;
      fetchStatus();
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = data?.state === "open";
  const isConnecting = data?.state === "connecting";
  const isDisconnected = !isConnected && !isConnecting;

  return (
    <Card
      className={`overflow-hidden shadow-card transition-all ${
        isConnected
          ? "border-whatsapp/30"
          : "border-destructive/30 shadow-[0_0_30px_-10px_hsl(var(--destructive)/0.4)]"
      }`}
    >
      <CardHeader
        className={`${
          isConnected
            ? "bg-gradient-to-r from-whatsapp/10 to-transparent"
            : "bg-gradient-to-r from-destructive/10 to-transparent"
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg shadow-md ${
                isConnected
                  ? "bg-whatsapp text-whatsapp-foreground"
                  : "bg-destructive text-destructive-foreground"
              }`}
            >
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp da Academia</CardTitle>
              <CardDescription>
                {isConnected
                  ? "Mensagens podem ser enviadas normalmente."
                  : isConnecting
                  ? "Aguardando confirmação do dispositivo..."
                  : "Conecte o WhatsApp diretamente no painel da Evolution."}
              </CardDescription>
            </div>
          </div>
          {isConnected ? (
            <Badge className="bg-whatsapp/15 text-whatsapp border-whatsapp/30 hover:bg-whatsapp/15">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Conectado
            </Badge>
          ) : isConnecting ? (
            <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Conectando
            </Badge>
          ) : (
            <Badge
              variant="destructive"
              className="animate-pulse-glow-destructive"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Desconectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {isDisconnected && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-destructive">Ação necessária</p>
              <p className="text-muted-foreground text-xs">
                O site apenas consulta o status. Abra o painel da Evolution para escanear o QR Code
                e depois volte aqui para atualizar o status.
              </p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isConnected && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            QR Code disponível somente na Evolution para evitar reinicializações da instância pelo site.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => fetchStatus()}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-primary hover:shadow-elegant"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar Status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
