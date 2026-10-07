import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { confirm as askConfirm } from "@/components/ui/confirm-dialog";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Smartphone,
  AlertTriangle,
  LogOut,
} from "lucide-react";

type State = "open" | "close" | "connecting" | "unknown" | string;

interface StatusResponse {
  state: State;
  connected?: boolean;
  instance?: string;
  provider?: "openwa";
  qr?: string | null;
  qrError?: string | null;
  error?: string;
}

export function WhatsAppStatus() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const readStatus = useCallback(async (includeQr: boolean) => {
    const { data: resp, error } = await supabase.functions.invoke("whatsapp-status", {
      body: { action: "status", includeQr },
    });

    if (error) throw error;
    return resp as StatusResponse;
  }, []);

  const fetchInitialStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await readStatus(true);
      setData(next);
    } catch (err: unknown) {
      setData({ state: "unknown", connected: false, qr: null });
      toast({
        title: "Erro ao consultar WhatsApp",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [readStatus, toast]);

  const handleLogout = useCallback(async () => {
    const confirmed = await askConfirm({
      title: "Desconectar WhatsApp?",
      description: "A sessão atual será encerrada e um novo QR Code será gerado automaticamente para conectar outro aparelho.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("whatsapp-status", {
        body: { action: "logout", includeQr: false },
      });
      if (error) throw error;

      setData((current) => ({
        ...(current || { state: "connecting" }),
        state: "connecting",
        connected: false,
        qr: null,
        qrError: null,
      }));

      toast({
        title: "WhatsApp desconectado",
        description: "Aguardando o novo QR Code do OpenWA.",
      });
    } catch (err: unknown) {
      toast({
        title: "Erro ao desconectar WhatsApp",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });

      try {
        const next = await readStatus(true);
        setData(next);
      } catch (_) {
        // O observador abaixo continuará tentando quando o OpenWA voltar.
      }
    } finally {
      setActionLoading(false);
    }
  }, [readStatus, toast]);

  useEffect(() => {
    void fetchInitialStatus();
  }, [fetchInitialStatus]);

  useEffect(() => {
    const currentState = data?.state;
    if (!currentState) return;

    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = (state: State, delayOverride?: number) => {
      if (cancelled) return;
      const delay = delayOverride ?? (state === "open" ? 30_000 : 3_000);
      timer = setTimeout(() => void poll(state), delay);
    };

    const poll = async (observedState: State) => {
      if (cancelled || running) return;

      running = true;
      try {
        const next = await readStatus(observedState !== "open");
        if (!cancelled) {
          setData(next);
          scheduleNext(next.state);
        }
      } catch (_) {
        // Reinícios curtos do OpenWA são esperados após logout; apenas tenta novamente.
        scheduleNext(observedState);
      } finally {
        running = false;
      }
    };

    scheduleNext(currentState, currentState === "open" ? 30_000 : 1_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [data?.state, readStatus]);

  const isConnected = data?.state === "open";
  const isConnecting = data?.state === "connecting";
  const isDisconnected = !isConnected && !isConnecting;

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
                  ? "Aguardando a conexão do WhatsApp..."
                  : "Escaneie o QR Code abaixo para conectar o OpenWA."}
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
                No WhatsApp do celular, abra Aparelhos conectados, toque em Conectar um aparelho
                e escaneie o QR Code abaixo.
              </p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isConnected && data?.qr && (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-4">
            <img
              src={data.qr}
              alt="QR Code para conectar o WhatsApp ao OpenWA"
              className="h-64 w-64 max-w-full object-contain"
            />
            <p className="text-xs text-muted-foreground text-center">
              O QR Code é atualizado automaticamente enquanto o OpenWA aguarda a conexão.
            </p>
          </div>
        )}

        {!isConnected && !loading && !data?.qr && (
          <div className="text-sm text-muted-foreground text-center py-4">
            {data?.qrError
              ? `Não foi possível carregar o QR Code: ${data.qrError}`
              : "Preparando o QR Code do OpenWA..."}
          </div>
        )}

        {isConnected && (
          <div className="pt-2">
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={loading || actionLoading}
              className="w-full"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-1" />
              )}
              Desconectar WhatsApp
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
