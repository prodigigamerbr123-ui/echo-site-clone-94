import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Zap, Clock, Calendar, ChevronRight, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ParamDef = { name: string; label: string; min: number; max: number; suffix?: string };

interface AutomationDef {
  key: string;
  title: string;
  description: string;
  when: string;
  messageTypes: string[]; // usados para contar mensagens dos últimos 30 dias
  params: ParamDef[];
}

const AUTOMATIONS: AutomationDef[] = [
  {
    key: "evaluation_invite",
    title: "Convite de avaliação vencida",
    description:
      "Quando um aluno completa muito tempo sem avaliação física, enviamos um convite pra remarcar.",
    when:
      "Todos os dias às 08:00, o motor busca alunos que passaram do limite de dias sem avaliação e dispara um convite (limitado por dia pra não inundar).",
    messageTypes: ["evaluation_reminder"],
    params: [
      { name: "days_overdue", label: "Dias sem avaliação", min: 7, max: 365, suffix: "dias" },
      { name: "daily_limit", label: "Máximo de convites por dia", min: 1, max: 500 },
    ],
  },
  {
    key: "birthday",
    title: "Mensagem de aniversário",
    description: "No dia do aniversário do aluno, enviamos uma mensagem carinhosa.",
    when: "Todos os dias às 08:00, o motor identifica os aniversariantes do dia e dispara a mensagem entre 09h e 12h.",
    messageTypes: ["birthday"],
    params: [],
  },
  {
    key: "evaluation_reminders",
    title: "Lembretes de avaliação agendada",
    description:
      "Quando você agenda uma avaliação, criamos 3 mensagens: confirmação, véspera às 18h e 3h antes.",
    when: "No momento em que a avaliação é criada. Se desligar, agendar uma avaliação NÃO gera as mensagens (só cria o compromisso).",
    messageTypes: [
      "evaluation_confirmation",
      "evaluation_reminder_1d",
      "evaluation_reminder_day",
    ],
    params: [],
  },
  {
    key: "evaluation_followup",
    title: "Follow-up depois da avaliação",
    description:
      "Alguns dias depois da avaliação, perguntamos como o aluno está indo.",
    when: "Ao marcar uma avaliação como Realizada, agendamos a mensagem para os dias definidos abaixo, entre 09h e 12h.",
    messageTypes: ["evaluation_followup"],
    params: [
      { name: "days_after", label: "Dias depois da avaliação", min: 1, max: 60, suffix: "dias" },
    ],
  },
  {
    key: "no_show_reschedule",
    title: "Remarcação por falta",
    description:
      "Se o aluno não comparece na avaliação, mandamos uma mensagem no dia seguinte pra remarcar.",
    when: "Ao marcar uma avaliação como Faltou, agendamos a mensagem para o dia seguinte entre 09h e 12h.",
    messageTypes: ["evaluation_reschedule"],
    params: [],
  },
  {
    key: "welcome_message",
    title: "Boas-vindas ao novo aluno",
    description:
      "Assim que o aluno é cadastrado, mandamos uma mensagem apresentando a academia e convidando pra primeira avaliação.",
    when: "Cerca de 5 minutos depois do cadastro do aluno.",
    messageTypes: ["welcome"],
    params: [],
  },
  {
    key: "reengagement",
    title: "Reengajamento de aluno inativo",
    description:
      "Quando você marca um aluno como Inativo, mandamos um 'sentimos sua falta' alguns dias depois, convidando ele a voltar.",
    when: "No momento em que o aluno é marcado como Inativo, agendamos a mensagem para os dias definidos abaixo, entre 09h e 12h.",
    messageTypes: ["reengagement"],
    params: [
      { name: "days_after", label: "Dias depois da inativação", min: 1, max: 120, suffix: "dias" },
    ],
  },
];

const ALL_AUTO_TYPES = Array.from(new Set(AUTOMATIONS.flatMap((a) => a.messageTypes)));

export default function Automacoes() {
  const qc = useQueryClient();

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["automation-settings-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_settings")
        .select("key, enabled, params, updated_at");
      if (error) throw error;
      const map: Record<string, { enabled: boolean; params: Record<string, any> }> = {};
      for (const r of data || []) {
        map[r.key] = { enabled: !!r.enabled, params: (r.params as any) || {} };
      }
      return map;
    },
  });

  const { data: counters } = useQuery({
    queryKey: ["automation-counters"],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const thirtyAgo = new Date(Date.now() - 30 * 86400_000);

      // Total do mês
      const totalMonth = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString())
        .in("message_type", ALL_AUTO_TYPES);

      // Última execução (proxy): última mensagem criada nos tipos do motor diário
      const lastRun = await supabase
        .from("scheduled_messages")
        .select("created_at")
        .in("message_type", ["evaluation_reminder", "birthday"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Contadores por tipo (30 dias)
      const perType: Record<string, number> = {};
      await Promise.all(
        ALL_AUTO_TYPES.map(async (t) => {
          const { count } = await supabase
            .from("scheduled_messages")
            .select("id", { count: "exact", head: true })
            .eq("message_type", t)
            .gte("created_at", thirtyAgo.toISOString());
          perType[t] = count ?? 0;
        }),
      );

      return {
        totalMonth: totalMonth.count ?? 0,
        lastRunAt: lastRun.data?.created_at ?? null,
        perType,
      };
    },
    refetchInterval: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("automation_settings")
        .update({ enabled })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["automation-settings-page"] });
      toast.success(vars.enabled ? "Automação ligada" : "Automação desligada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar"),
  });

  const paramMutation = useMutation({
    mutationFn: async ({ key, params }: { key: string; params: Record<string, any> }) => {
      const { error } = await supabase
        .from("automation_settings")
        .update({ params })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings-page"] });
      toast.success("Parâmetros atualizados");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-primary to-primary/70 rounded-lg shadow-lg">
          <Zap className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Automações</h1>
          <p className="text-muted-foreground">
            Ligue, desligue e ajuste as mensagens automáticas do sistema.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Última execução do motor
            </div>
            <div className="text-lg font-semibold mt-1">
              {counters?.lastRunAt
                ? format(new Date(counters.lastRunAt), "dd/MM 'às' HH:mm", { locale: ptBR })
                : "—"}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Próxima execução
            </div>
            <div className="text-lg font-semibold mt-1">Todo dia às 08:00 (Brasília)</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Automáticas neste mês
            </div>
            <div className="text-lg font-semibold mt-1">{counters?.totalMonth ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {loadingSettings ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-4">
          {AUTOMATIONS.map((a) => {
            const s = settings?.[a.key];
            const enabled = s?.enabled ?? false;
            const count30 = a.messageTypes.reduce(
              (sum, t) => sum + (counters?.perType?.[t] ?? 0), 0);
            return (
              <Card key={a.key} className={enabled ? "border-l-4 border-l-primary" : "opacity-90"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{a.title}</CardTitle>
                        <Badge variant={enabled ? "default" : "secondary"}>
                          {enabled ? "Ligada" : "Desligada"}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Sparkles className="h-3 w-3" /> {count30} nos últimos 30 dias
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">{a.description}</CardDescription>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => toggleMutation.mutate({ key: a.key, enabled: v })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Quando dispara: </span>
                    {a.when}
                  </div>
                  {a.params.length > 0 && (
                    <ParamsEditor
                      def={a}
                      current={s?.params || {}}
                      disabled={!enabled}
                      onSave={(params) => paramMutation.mutate({ key: a.key, params })}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ParamsEditor({
  def, current, disabled, onSave,
}: {
  def: AutomationDef;
  current: Record<string, any>;
  disabled: boolean;
  onSave: (params: Record<string, any>) => void;
}) {
  const [local, setLocal] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const p of def.params) o[p.name] = String(current[p.name] ?? "");
    return o;
  });

  const commit = (p: ParamDef) => {
    const n = Number(local[p.name]);
    if (!Number.isFinite(n) || n < p.min || n > p.max) {
      toast.error(`${p.label} deve estar entre ${p.min} e ${p.max}`);
      setLocal((s) => ({ ...s, [p.name]: String(current[p.name] ?? "") }));
      return;
    }
    if (n === Number(current[p.name])) return;
    onSave({ ...current, [p.name]: n });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
      {def.params.map((p) => (
        <div key={p.name} className="space-y-1.5">
          <Label htmlFor={`${def.key}-${p.name}`} className="text-xs">
            {p.label}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${def.key}-${p.name}`}
              type="number"
              min={p.min}
              max={p.max}
              disabled={disabled}
              value={local[p.name]}
              onChange={(e) => setLocal((s) => ({ ...s, [p.name]: e.target.value }))}
              onBlur={() => commit(p)}
              className="h-9"
            />
            {p.suffix && <span className="text-xs text-muted-foreground">{p.suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
