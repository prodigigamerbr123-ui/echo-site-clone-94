import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  NotificationSettings,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/lib/appSettings";
import { useEffect, useState } from "react";

const ITEMS: { key: keyof NotificationSettings; title: string; desc?: string }[] = [
  { key: "notify_failed", title: "Falha no envio de mensagem", desc: "Recomendado manter ligado." },
  { key: "notify_sent_summary", title: "Resumo de mensagens enviadas" },
  { key: "notify_evaluation_created", title: "Avaliação agendada" },
  { key: "notify_whatsapp_disconnected", title: "WhatsApp desconectado", desc: "Alerta importante." },
  { key: "notify_student_registered", title: "Novo aluno cadastrado" },
  { key: "notify_daily_summary", title: "Resumo diário do motor de automações" },
];

export default function Configuracoes() {
  const { data: settings, isLoading } = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [minutes, setMinutes] = useState<number>(10);

  useEffect(() => {
    if (settings) setMinutes(settings.sent_summary_minutes);
  }, [settings?.sent_summary_minutes]);

  const save = async (partial: Partial<NotificationSettings>) => {
    try {
      await update.mutateAsync(partial);
      toast.success("Configuração salva");
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e?.message });
    }
  };

  const commitMinutes = async () => {
    if (!settings) return;
    const clamped = Math.max(5, Math.min(60, Math.round(minutes || 10)));
    setMinutes(clamped);
    if (clamped !== settings.sent_summary_minutes) {
      await save({ sent_summary_minutes: clamped });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Ajuste as notificações do sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>Escolha quais alertas você quer receber.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !settings ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            ITEMS.map((item) => (
              <div key={item.key} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label className="text-base">{item.title}</Label>
                    {item.desc && (
                      <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                    )}
                  </div>
                  <Switch
                    checked={Boolean(settings[item.key])}
                    onCheckedChange={(checked) => save({ [item.key]: checked } as any)}
                  />
                </div>
                {item.key === "notify_sent_summary" && settings.notify_sent_summary && (
                  <div className="flex items-center gap-2 mt-3">
                    <Label htmlFor="grp-min" className="text-sm">Agrupar a cada</Label>
                    <Input
                      id="grp-min"
                      type="number"
                      min={5}
                      max={60}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                      onBlur={commitMinutes}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">minutos (5–60)</span>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
