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
  LogOut,
  Smartphone,
  AlertTriangle,
} from "lucide-react";

type State = "open" | "close" | "connecting" | "unknown" | string;

interface StatusResponse {
  state: State;
  qrcode: string | null;
  pairingCode: string | null;
  instance?: string;
  error?: string;
}

export function WhatsAppStatus() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatusResponse | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(
    async (action: "status" | "connect" | "logout" = "status") => {
      setLoading(true);
      try {
        const { data: resp, error } = await supabase.functions.invoke("whatsapp-status", {
          body: { action },
        });
        if (error) throw error;
        setData(resp as StatusResponse);
        if (action === "logout") {
          toast({ title: "WhatsApp desconectado" });
        } else if (action === "connect") {
          toast({ title: "Atualizando conexão...", description: "Buscando novo QR Code." });
        }
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
    fetchStatus("status");
    // Intervalo fixo curto; pula fetch quando já está conectado (evita recriar timer a cada oscilação)
    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      // Se conectado, só refetch a cada 6 ciclos (~60s); senão a cada ciclo (~10s)
      if (stateRef.current === "open" && tick % 6 !== 0) return;
      fetchStatus("status");
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = data?.state === "open";
  const isConnecting = data?.state === "connecting";
  const isDisconnected = !isConnected && !isConnecting;

  const qrSrc = data?.qrcode
    ? data.qrcode.startsWith("data:")
      ? data.qrcode
      : `data:image/png;base64,${data.qrcode}`
    : null;

  return (
    <Card
      className={`overflow-hidden shadow-card transition-all ${
        isConnected
          ? "border-[hsl(var(--success))]/30"
          : "border-destructive/30 shadow-[0_0_30px_-10px_hsl(var(--destructive)/0.4)]"
      }`}
    >
      <CardHeader
        className={`${
          isConnected
            ? "bg-gradient-to-r from-[hsl(var(--success))]/10 to-transparent"
            : "bg-gradient-to-r from-destructive/10 to-transparent"
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg shadow-md text-white ${
                isConnected
                  ? "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600"
                  : "bg-gradient-to-br from-destructive to-red-700"
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
                  : "Conecte o WhatsApp para enviar mensagens."}
              </CardDescription>
            </div>
          </div>
          {isConnected ? (
            <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 hover:bg-[hsl(var(--success))]/15">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Conectado
            </Badge>
          ) : isConnecting ? (
            <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 hover:bg-[hsl(var(--warning))]/15">
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
                Conecte o WhatsApp da academia escaneando o QR Code abaixo para liberar o envio de
                mensagens.
              </p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isConnected && qrSrc && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border-2 border-primary/20 bg-white p-3 shadow-elegant">
              <img src={qrSrc} alt="QR Code WhatsApp" className="h-56 w-56" />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Abra o WhatsApp no celular da academia → <strong>Aparelhos conectados</strong> →{" "}
              <strong>Conectar um aparelho</strong>
            </p>
            {data?.pairingCode && (
              <p className="text-sm">
                Ou use o código:{" "}
                <span className="font-mono font-bold text-primary">{data.pairingCode}</span>
              </p>
            )}
          </div>
        )}

        {!isConnected && !qrSrc && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Não foi possível obter o QR Code. Clique em "Atualizar" para tentar novamente.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => fetchStatus("connect")}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-primary hover:shadow-elegant"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {isConnected ? "Atualizar Status" : "Atualizar / Gerar QR"}
          </Button>
          {isConnected && (
            <Button
              variant="destructive"
              onClick={() => fetchStatus("logout")}
              disabled={loading}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Desconectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
