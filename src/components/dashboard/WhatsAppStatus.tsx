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
  dashboardUrl?: string;
}

export function WhatsAppStatus() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const qrBusy = useRef(false);
  const connectAttempted = useRef(false);
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
      } catch (err: unknown) {
        toast({
          title: "Erro ao consultar WhatsApp",
          description: err instanceof Error ? err.message : "Tente novamente",
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
    // Verifica mais rapidamente enquanto aguarda escaneamento do QR.
    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      // Se conectado, consulta a cada 60s; caso contrário, a cada 6s.
      if (stateRef.current === "open" && tick % 10 !== 0) return;
      fetchStatus();
    }, 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = data?.state === "open";
  const isConnecting = data?.state === "connecting";
  const isDisconnected = !isConnected && !isConnecting;
  const currentState = data?.state;

  const fetchQr = useCallback(async (startIfMissing: boolean) => {
    if (qrBusy.current) return;
    qrBusy.current = true;
    setQrLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("whatsapp-status", {
        body: { action: "qr" },
      });
      if (error) throw error;
      const image = (response as { qrCode?: string | null } | null)?.qrCode;
      if (image) {
        setQrCode(image);
        setQrError(null);
      } else if (startIfMissing && !connectAttempted.current) {
        // Inicia uma única vez, após comprovar que não há QR disponível.
        // Atualizações periódicas consultam somente o QR, sem reiniciar o WhatsApp.
        connectAttempted.current = true;
        const { error: connectError } = await supabase.functions.invoke("whatsapp-status", {
          body: { action: "connect" },
        });
        if (connectError) throw connectError;
        setQrError(null);
      } else if (!image) {
        setQrCode(null);
      }
    } catch (err: unknown) {
      setQrError(err instanceof Error ? err.message : "Falha ao carregar QR Code.");
    } finally {
      qrBusy.current = false;
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      setQrCode(null);
      setQrError(null);
      connectAttempted.current = false;
      return;
    }
    if (!currentState || !["close", "connecting"].includes(currentState)) return;
    void fetchQr(currentState === "close");
    const timer = setInterval(() => { void fetchQr(false); }, 8000);
    return () => clearInterval(timer);
  }, [currentState, isConnected, fetchQr]);

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("whatsapp-status", {
        body: { action: "logout" },
      });
      if (error) throw error;
      setQrCode(null);
      connectAttempted.current = false;
      setData((current) => current ? { ...current, state: "close", connected: false } : current);
      toast({ title: "WhatsApp desconectado", description: "Aguardando novo QR Code." });
      await fetchStatus();
    } catch (err: unknown) {
      toast({
        title: "Não foi possível desconectar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  };

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
                  : "Escaneie o QR Code abaixo para conectar o WhatsApp."}
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
                No celular, abra WhatsApp → Aparelhos conectados → Conectar aparelho.
                Escaneie o código abaixo. O status será atualizado automaticamente.
              </p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isConnected && data && ["close", "connecting"].includes(data.state) && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-background p-4" aria-live="polite">
            {qrCode ? (
              <img
                src={qrCode}
                alt="QR Code para vincular WhatsApp da academia"
                className="h-64 w-64 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-md bg-muted/30 text-center text-sm text-muted-foreground">
                {qrLoading && <Loader2 className="h-6 w-6 animate-spin" />}
                <p>{qrLoading ? "Preparando QR Code..." : "Aguardando QR Code da Evolution..."}</p>
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              O QR Code é atualizado automaticamente enquanto o WhatsApp estiver desconectado.
            </p>
            {qrError && <p role="alert" className="text-center text-sm text-destructive">{qrError}</p>}
          </div>
        )}

        {isConnected && (
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => void disconnect()}
            disabled={disconnecting}
          >
            {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Desconectar WhatsApp
          </Button>
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
