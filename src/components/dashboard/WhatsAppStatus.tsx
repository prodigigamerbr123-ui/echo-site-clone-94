import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Loader2, RefreshCw, LogOut, Smartphone } from "lucide-react";

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

  const fetchStatus = useCallback(async (action: "status" | "connect" | "logout" = "status") => {
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("whatsapp-status", {
        body: { action },
      });
      if (error) throw error;
      setData(resp as StatusResponse);
      if (action === "logout") {
        toast({ title: "WhatsApp desconectado" });
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
  }, [toast]);

  useEffect(() => {
    fetchStatus("status");
    // Auto-refresh every 10s while disconnected, every 60s when connected
    const interval = setInterval(() => {
      fetchStatus("status");
    }, data?.state === "open" ? 60000 : 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.state]);

  const isConnected = data?.state === "open";
  const isConnecting = data?.state === "connecting";

  const qrSrc = data?.qrcode
    ? data.qrcode.startsWith("data:") ? data.qrcode : `data:image/png;base64,${data.qrcode}`
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <CardTitle>WhatsApp da Academia</CardTitle>
          </div>
          {isConnected ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Conectado
            </Badge>
          ) : isConnecting ? (
            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Conectando
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              Desconectado
            </Badge>
          )}
        </div>
        <CardDescription>
          {isConnected
            ? "Mensagens podem ser enviadas normalmente."
            : "Escaneie o QR Code abaixo com o WhatsApp da academia."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isConnected && qrSrc && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border bg-white p-3">
              <img src={qrSrc} alt="QR Code WhatsApp" className="h-56 w-56" />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Abra o WhatsApp no celular da academia → Aparelhos conectados → Conectar um aparelho
            </p>
            {data?.pairingCode && (
              <p className="text-sm">
                Ou use o código: <span className="font-mono font-bold">{data.pairingCode}</span>
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
            variant="outline"
            size="sm"
            onClick={() => fetchStatus("connect")}
            disabled={loading}
            className="flex-1"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {isConnected && (
            <Button
              variant="destructive"
              size="sm"
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
