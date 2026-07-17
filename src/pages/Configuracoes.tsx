import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  NotificationSettings,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/lib/appSettings";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  MessageSquare,
  Sparkles,
  UserPlus,
  WifiOff,
} from "lucide-react";

type NotifKey = keyof NotificationSettings;

type NotifItem = {
  key: NotifKey;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  recommended?: boolean;
};

type NotifGroup = {
  id: string;
  title: string;
  description: string;
  items: NotifItem[];
};

const GROUPS: NotifGroup[] = [
  {
    id: "mensagens",
    title: "Mensagens",
    description: "Alertas sobre o envio das mensagens do WhatsApp.",
    items: [
      {
        key: "notify_failed",
        title: "Falha no envio de mensagem",
        desc: "Aviso imediato quando uma mensagem agendada não é entregue.",
        icon: AlertTriangle,
        recommended: true,
      },
      {
        key: "notify_sent_summary",
        title: "Resumo de mensagens enviadas",
        desc: "Agrupa as mensagens enviadas em um único aviso a cada intervalo.",
        icon: CheckCircle2,
      },
    ],
  },
  {
    id: "alunos",
    title: "Alunos e avaliações",
    description: "Eventos que acontecem com seus alunos.",
    items: [
      {
        key: "notify_evaluation_created",
        title: "Avaliação agendada",
        desc: "Toca sempre que uma nova avaliação física é agendada.",
        icon: CalendarCheck,
      },
      {
        key: "notify_student_registered",
        title: "Novo aluno cadastrado",
        desc: "Notifica quando um aluno entra na sua base.",
        icon: UserPlus,
      },
    ],
  },
  {
    id: "sistema",
    title: "Sistema",
    description: "Saúde da integração com o WhatsApp e do motor de automações.",
    items: [
      {
        key: "notify_whatsapp_disconnected",
        title: "WhatsApp desconectado",
        desc: "Alerta crítico quando a instância do WhatsApp perde conexão.",
        icon: WifiOff,
        recommended: true,
      },
      {
        key: "notify_daily_summary",
        title: "Resumo diário das automações",
        desc: "Recebe um resumo do que o motor de automações fez no dia.",
        icon: Sparkles,
      },
    ],
  },
];

export default function Configuracoes() {
  const { data: settings, isLoading } = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [minutes, setMinutes] = useState<number>(10);

  useEffect(() => {
    if (settings) setMinutes(settings.sent_summary_minutes);
  }, [settings?.sent_summary_minutes]);

  const totals = useMemo(() => {
    if (!settings) return { active: 0, total: 0 };
    const all = GROUPS.flatMap((g) => g.items);
    const active = all.filter((i) => Boolean(settings[i.key])).length;
    return { active, total: all.length };
  }, [settings]);

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

  const toggleAll = async (enabled: boolean) => {
    const patch: Partial<NotificationSettings> = {};
    for (const g of GROUPS) for (const i of g.items) (patch as any)[i.key] = enabled;
    await save(patch);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie quais alertas do sistema você recebe em tempo real.
          </p>
        </div>
        {settings && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Bell className="h-3.5 w-3.5" />
              {totals.active}/{totals.total} ativas
            </Badge>
            <button
              type="button"
              onClick={() => toggleAll(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Ativar tudo
            </button>
            <span className="text-xs text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Desativar tudo
            </button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="rounded-lg bg-primary/10 text-primary p-2">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Notificações</CardTitle>
            <CardDescription>
              Escolha o que deve aparecer como aviso enquanto você usa o sistema.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {isLoading || !settings ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            GROUPS.map((group, gi) => (
              <div key={group.id} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h3>
                    <p className="text-xs text-muted-foreground/80">{group.description}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const checked = Boolean(settings[item.key]);
                    return (
                      <div
                        key={item.key}
                        className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`shrink-0 rounded-lg p-2 ${
                                checked
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Label className="text-sm font-medium">{item.title}</Label>
                                {item.recommended && (
                                  <Badge variant="outline" className="text-[10px] uppercase">
                                    Recomendado
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>

                              {item.key === "notify_sent_summary" && checked && (
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                  <Label htmlFor="grp-min" className="text-xs">
                                    Agrupar a cada
                                  </Label>
                                  <Input
                                    id="grp-min"
                                    type="number"
                                    min={5}
                                    max={60}
                                    value={minutes}
                                    onChange={(e) => setMinutes(Number(e.target.value))}
                                    onBlur={commitMinutes}
                                    className="h-8 w-20"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    min (5–60)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <Switch
                            checked={checked}
                            onCheckedChange={(v) => save({ [item.key]: v } as any)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {gi < GROUPS.length - 1 && <Separator className="mt-2" />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
