import { useMemo, useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchAutomationSettings, AutomationSettingsMap } from "@/lib/automationSettings";

type ParamDef = { name: string; label: string; fallback: number; suffix?: string };

type AutomationDef = {
  key: string;
  title: string;
  description: string;
  when: string;
  messageTypes: string[];
  params?: ParamDef[];
};

const AUTOMATIONS: AutomationDef[] = [
  {
    key: "evaluation_invite",
    title: "Convite para avaliação física",
    description: "Envia lembretes para alunos que ainda não fizeram avaliação física.",
    when: "Diariamente pela manhã, para alunos sem avaliação há X dias.",
    messageTypes: ["evaluation_reminder"],
    params: [
      { name: "days_overdue", label: "Dias sem avaliação", fallback: 30, suffix: "dias" },
      { name: "daily_limit", label: "Limite diário", fallback: 10, suffix: "msgs" },
    ],
  },
  {
    key: "birthday",
    title: "Mensagem de aniversário",
    description: "Parabeniza o aluno no dia do aniversário.",
    when: "Todo dia pela manhã, para aniversariantes do dia.",
    messageTypes: ["birthday"],
  },
  {
    key: "evaluation_reminders",
    title: "Lembretes de avaliação agendada",
    description: "Confirmação e lembretes automáticos antes da avaliação.",
    when: "Ao agendar, no dia anterior e no dia da avaliação.",
    messageTypes: ["evaluation_confirmation", "evaluation_reminder_1d", "evaluation_reminder_day"],
  },
  {
    key: "evaluation_followup",
    title: "Follow-up pós-avaliação",
    description: "Mensagem de acompanhamento após a avaliação realizada.",
    when: "X dias após a avaliação concluída.",
    messageTypes: ["evaluation_followup"],
    params: [{ name: "days_after", label: "Dias após avaliação", fallback: 7, suffix: "dias" }],
  },
  {
    key: "no_show_reschedule",
    title: "Reagendamento por falta",
    description: "Convida o aluno a reagendar quando não comparece.",
    when: "Ao marcar uma avaliação como não comparecida.",
    messageTypes: ["evaluation_reschedule"],
  },
  {
    key: "welcome_message",
    title: "Mensagem de boas-vindas",
    description: "Envia uma boas-vindas para alunos recém-cadastrados.",
    when: "Logo após o cadastro do aluno.",
    messageTypes: ["welcome"],
  },
  {
    key: "reengagement",
    title: "Reengajamento de alunos inativos",
    description: "Reativa alunos que não recebem mensagens há um tempo.",
    when: "Para alunos sem contato há X dias.",
    messageTypes: ["reengagement"],
    params: [{ name: "days_after", label: "Dias inativo", fallback: 30, suffix: "dias" }],
  },
];

const ALL_AUTO_TYPES = Array.from(new Set(AUTOMATIONS.flatMap((a) => a.messageTypes)));

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export default function Automacoes() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["automation-settings"],
    queryFn: fetchAutomationSettings,
  });

  const { data: lastRun } = useQuery({
    queryKey: ["automation-last-run"],
    queryFn: async () => {
      const { data } = await supabase
        .from("scheduled_messages")
        .select("created_at")
        .in("message_type", ["evaluation_reminder", "birthday"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.created_at ?? null;
    },
  });

  const { data: monthCount } = useQuery({
    queryKey: ["automation-month-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .in("message_type", ALL_AUTO_TYPES)
        .gte("created_at", startOfMonth());
      return count ?? 0;
    },
  });

  const { data: last30Count } = useQuery({
    queryKey: ["automation-30d-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .in("message_type", ALL_AUTO_TYPES)
        .gte("created_at", daysAgoISO(30));
      return count ?? 0;
    },
  });

  const { data: perTypeCounts } = useQuery({
    queryKey: ["automation-per-type-30d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("message_type")
        .in("message_type", ALL_AUTO_TYPES)
        .gte("created_at", daysAgoISO(30));
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.message_type] = (counts[row.message_type] ?? 0) + 1;
      }
      return counts;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("automation_settings")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
      toast.success("Automação atualizada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const paramsMutation = useMutation({
    mutationFn: async ({ key, params }: { key: string; params: Record<string, any> }) => {
      const { error } = await supabase
        .from("automation_settings")
        .update({ params, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
      toast.success("Parâmetros salvos");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Automações</h1>
          <p className="text-muted-foreground">
            Ligue, desligue e ajuste as mensagens automáticas do sistema.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Última execução do motor</CardDescription>
            <CardTitle className="text-lg">
              {lastRun ? new Date(lastRun).toLocaleString("pt-BR") : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mensagens automáticas no mês</CardDescription>
            <CardTitle className="text-2xl">{monthCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Últimos 30 dias</CardDescription>
            <CardTitle className="text-2xl">{last30Count ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {AUTOMATIONS.map((a) => (
          <AutomationCard
            key={a.key}
            def={a}
            settings={settings}
            perTypeCounts={perTypeCounts ?? {}}
            onToggle={(enabled) => toggleMutation.mutate({ key: a.key, enabled })}
            onSaveParams={(params) => paramsMutation.mutate({ key: a.key, params })}
            saving={paramsMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function AutomationCard({
  def,
  settings,
  perTypeCounts,
  onToggle,
  onSaveParams,
  saving,
}: {
  def: AutomationDef;
  settings: AutomationSettingsMap | undefined;
  perTypeCounts: Record<string, number>;
  onToggle: (enabled: boolean) => void;
  onSaveParams: (params: Record<string, any>) => void;
  saving: boolean;
}) {
  const setting = settings?.[def.key];
  const enabled = !!setting?.enabled;

  const initialParams = useMemo(() => {
    const p: Record<string, number> = {};
    for (const pd of def.params ?? []) {
      p[pd.name] = Number(setting?.params?.[pd.name] ?? pd.fallback);
    }
    return p;
  }, [setting, def.params]);

  const [localParams, setLocalParams] = useState<Record<string, number>>(initialParams);
  useEffect(() => setLocalParams(initialParams), [initialParams]);

  const count30d = def.messageTypes.reduce((s, t) => s + (perTypeCounts[t] ?? 0), 0);
  const dirty =
    def.params?.some((pd) => Number(localParams[pd.name]) !== Number(initialParams[pd.name])) ??
    false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{def.title}</CardTitle>
            <CardDescription className="mt-1">{def.description}</CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <span className="font-medium">Quando roda: </span>
          <span className="text-muted-foreground">{def.when}</span>
        </div>

        {def.params && def.params.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {def.params.map((pd) => (
                <div key={pd.name} className="space-y-1">
                  <Label htmlFor={`${def.key}-${pd.name}`} className="text-xs">
                    {pd.label}
                  </Label>
                  <Input
                    id={`${def.key}-${pd.name}`}
                    type="number"
                    min={0}
                    value={localParams[pd.name] ?? ""}
                    onChange={(e) =>
                      setLocalParams((p) => ({
                        ...p,
                        [pd.name]: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => onSaveParams(localParams)}
            >
              Salvar parâmetros
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">Mensagens (últimos 30 dias)</span>
          <Badge variant="secondary">{count30d}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
