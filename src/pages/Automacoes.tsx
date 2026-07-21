import { usePageTitle } from "@/hooks/usePageTitle";
import { useMemo, useState, useEffect } from "react";
import { Zap, Eye, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetchAutomationSettings, AutomationSettingsMap } from "@/lib/automationSettings";
import { invalidateTemplateCache } from "@/lib/messageTemplates";
import { fetchAutomationTemplateIds } from "@/lib/automationTemplateIds";


type ParamDef = { name: string; label: string; fallback: number; suffix?: string };

type MessageTypeDef = { type: string; label: string };

type AutomationDef = {
  key: string;
  title: string;
  description: string;
  when: string;
  messageTypes: MessageTypeDef[];
  placeholders: string[];
  params?: ParamDef[];
};

const AUTOMATIONS: AutomationDef[] = [
  {
    key: "evaluation_invite",
    title: "Convite para avaliação física",
    description: "Envia lembretes para alunos que ainda não fizeram avaliação física.",
    when: "Diariamente pela manhã, para alunos sem avaliação há X dias.",
    messageTypes: [{ type: "evaluation_reminder", label: "Convite de avaliação" }],
    placeholders: ["{nome}"],
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
    messageTypes: [{ type: "birthday", label: "Aniversário" }],
    placeholders: ["{nome}"],
  },
  {
    key: "evaluation_reminders",
    title: "Lembretes de avaliação agendada",
    description: "Confirmação e lembretes automáticos antes da avaliação.",
    when: "Ao agendar, no dia anterior e no dia da avaliação.",
    messageTypes: [
      { type: "evaluation_confirmation", label: "Confirmação (ao agendar)" },
      { type: "evaluation_reminder_1d", label: "Lembrete véspera" },
      { type: "evaluation_reminder_day", label: "Lembrete no dia" },
    ],
    placeholders: ["{nome}", "{data}", "{hora}"],
  },
  {
    key: "evaluation_followup",
    title: "Follow-up pós-avaliação",
    description: "Mensagem de acompanhamento após a avaliação realizada.",
    when: "X dias após a avaliação concluída.",
    messageTypes: [{ type: "evaluation_followup", label: "Follow-up" }],
    placeholders: ["{nome}"],
    params: [{ name: "days_after", label: "Dias após avaliação", fallback: 7, suffix: "dias" }],
  },
  {
    key: "no_show_reschedule",
    title: "Reagendamento por falta",
    description: "Convida o aluno a reagendar quando não comparece.",
    when: "Ao marcar uma avaliação como não comparecida.",
    messageTypes: [{ type: "evaluation_reschedule", label: "Reagendamento" }],
    placeholders: ["{nome}"],
  },
  {
    key: "welcome_message",
    title: "Mensagem de boas-vindas",
    description: "Envia uma boas-vindas para alunos recém-cadastrados.",
    when: "Logo após o cadastro do aluno.",
    messageTypes: [{ type: "welcome", label: "Boas-vindas" }],
    placeholders: ["{nome}"],
  },
  {
    key: "reengagement",
    title: "Reengajamento de alunos inativos",
    description: "Reativa alunos que não recebem mensagens há um tempo.",
    when: "Para alunos sem contato há X dias.",
    messageTypes: [{ type: "reengagement", label: "Reengajamento" }],
    placeholders: ["{nome}"],
    params: [{ name: "days_after", label: "Dias inativo", fallback: 30, suffix: "dias" }],
  },
  {
    key: "payment_reminder",
    title: "Lembrete de vencimento da mensalidade",
    description: "Avisa o aluno 3 dias antes e no dia do vencimento da mensalidade.",
    when: "Diariamente, 3 dias antes do vencimento e no próprio dia.",
    messageTypes: [
      { type: "payment_reminder_before", label: "Aviso antecipado" },
      { type: "payment_reminder_due", label: "Aviso no dia" },
    ],
    placeholders: ["{nome}", "{dias}"],
  },
  {
    key: "payment_overdue",
    title: "Cobrança de mensalidade vencida",
    description: "Envia cobrança automática para alunos com mensalidade em atraso.",
    when: "Diariamente, para alunos com vencimento em atraso.",
    messageTypes: [
      { type: "payment_overdue", label: "Cobrança de vencido" },
    ],
    placeholders: ["{nome}", "{dias}"],
  },
];

const ALL_AUTO_TYPES = Array.from(
  new Set(AUTOMATIONS.flatMap((a) => a.messageTypes.map((m) => m.type))),
);

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

type PredefinedMsg = { id: string; title: string; content: string };

export default function Automacoes() {
  usePageTitle("Automações");
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["automation-settings"],
    queryFn: fetchAutomationSettings,
  });

  const { data: predefined = [] } = useQuery<PredefinedMsg[]>({
    queryKey: ["predefined-messages", "automation-only"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predefined_messages")
        .select("id, title, content")
        .order("title");
      if (error) throw error;
      const automationIds = await fetchAutomationTemplateIds();
      return (data ?? []).filter((p: PredefinedMsg) => automationIds.has(p.id)) as PredefinedMsg[];
    },
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
      invalidateTemplateCache();
      toast.success("Configuração salva");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const templateMutation = useMutation({
    mutationFn: async ({
      key, messageType, predefinedId,
    }: { key: string; messageType: string; predefinedId: string | null }) => {
      const current = settings?.[key]?.params ?? {};
      const templates = { ...(current.templates ?? {}) } as Record<string, string>;
      if (predefinedId) templates[messageType] = predefinedId;
      else delete templates[messageType];
      const newParams = { ...current, templates };
      const { error } = await supabase
        .from("automation_settings")
        .update({ params: newParams, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
      invalidateTemplateCache();
      toast.success("Mensagem vinculada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao vincular"),
  });

  const [creatingFor, setCreatingFor] = useState<{
    key: string; messageType: string; suggestedTitle: string;
  } | null>(null);
  const [previewFor, setPreviewFor] = useState<PredefinedMsg | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Automações</h1>
          <p className="text-muted-foreground">
            Ligue, desligue e escolha a mensagem enviada em cada automação.
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
            predefined={predefined}
            perTypeCounts={perTypeCounts ?? {}}
            onToggle={(enabled) => toggleMutation.mutate({ key: a.key, enabled })}
            onSaveParams={(params) => paramsMutation.mutate({ key: a.key, params })}
            onLinkTemplate={(messageType, predefinedId) =>
              templateMutation.mutate({ key: a.key, messageType, predefinedId })
            }
            onCreateNew={(messageType, suggestedTitle) =>
              setCreatingFor({ key: a.key, messageType, suggestedTitle })
            }
            onPreview={(msg) => setPreviewFor(msg)}
            saving={paramsMutation.isPending}
          />
        ))}
      </div>

      {creatingFor && (
        <CreatePredefinedDialog
          open
          suggestedTitle={creatingFor.suggestedTitle}
          onClose={() => setCreatingFor(null)}
          onCreated={async (msg) => {
            await qc.invalidateQueries({ queryKey: ["predefined-messages"] });
            templateMutation.mutate({
              key: creatingFor.key,
              messageType: creatingFor.messageType,
              predefinedId: msg.id,
            });
            setCreatingFor(null);
          }}
        />
      )}

      {previewFor && (
        <Dialog open onOpenChange={(o) => !o && setPreviewFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{previewFor.title}</DialogTitle>
              <DialogDescription>Texto que será enviado</DialogDescription>
            </DialogHeader>
            <div className="whitespace-pre-wrap text-sm p-3 rounded-md bg-muted">
              {previewFor.content}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewFor(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AutomationCard({
  def, settings, predefined, perTypeCounts,
  onToggle, onSaveParams, onLinkTemplate, onCreateNew, onPreview, saving,
}: {
  def: AutomationDef;
  settings: AutomationSettingsMap | undefined;
  predefined: PredefinedMsg[];
  perTypeCounts: Record<string, number>;
  onToggle: (enabled: boolean) => void;
  onSaveParams: (params: Record<string, any>) => void;
  onLinkTemplate: (messageType: string, predefinedId: string | null) => void;
  onCreateNew: (messageType: string, suggestedTitle: string) => void;
  onPreview: (msg: PredefinedMsg) => void;
  saving: boolean;
}) {
  const setting = settings?.[def.key];
  const enabled = !!setting?.enabled;
  const templates = (setting?.params?.templates ?? {}) as Record<string, string>;

  const initialParams = useMemo(() => {
    const p: Record<string, number> = {};
    for (const pd of def.params ?? []) {
      p[pd.name] = Number(setting?.params?.[pd.name] ?? pd.fallback);
    }
    return p;
  }, [setting, def.params]);

  const [localParams, setLocalParams] = useState<Record<string, number>>(initialParams);
  useEffect(() => setLocalParams(initialParams), [initialParams]);

  const count30d = def.messageTypes.reduce((s, mt) => s + (perTypeCounts[mt.type] ?? 0), 0);
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

        <div className="space-y-3 pt-1">
          <div className="text-xs font-medium text-muted-foreground">
            {def.messageTypes.length > 1 ? "Mensagens enviadas" : "Mensagem enviada"}
          </div>
          {def.messageTypes.map((mt) => {
            const selectedId = templates[mt.type];
            const selectedMsg = selectedId ? predefined.find((p) => p.id === selectedId) : null;
            return (
              <div key={mt.type} className="space-y-1">
                {def.messageTypes.length > 1 && (
                  <Label className="text-xs">{mt.label}</Label>
                )}
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedId ?? ""}
                    onValueChange={(v) => {
                      if (v === "__new__") {
                        onCreateNew(mt.type, `${def.title} — ${mt.label}`);
                      } else {
                        onLinkTemplate(mt.type, v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Escolher mensagem" />
                    </SelectTrigger>
                    <SelectContent>
                      {predefined.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                      <SelectItem value="__new__">
                        <span className="flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> Criar nova mensagem
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedMsg && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0"
                      onClick={() => onPreview(selectedMsg)}
                      title="Ver texto"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Placeholders: {def.placeholders.join(", ")}
          </p>
        </div>

        {def.params && def.params.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
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
              onClick={() =>
                onSaveParams({ ...(setting?.params ?? {}), ...localParams })
              }
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

function CreatePredefinedDialog({
  open, suggestedTitle, onClose, onCreated,
}: {
  open: boolean;
  suggestedTitle: string;
  onClose: () => void;
  onCreated: (msg: PredefinedMsg) => void;
}) {
  const [title, setTitle] = useState(suggestedTitle);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTitle(suggestedTitle); setContent(""); }, [suggestedTitle]);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Preencha título e conteúdo");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("predefined_messages")
      .insert({ title: title.trim(), content: content.trim() })
      .select("id, title, content")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao criar");
      return;
    }
    toast.success("Mensagem criada");
    onCreated(data as PredefinedMsg);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova mensagem pré-definida</DialogTitle>
          <DialogDescription>
            Placeholders disponíveis: <code>{"{nome}"}</code>, <code>{"{data}"}</code>, <code>{"{hora}"}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pm-title">Título</Label>
            <Input id="pm-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm-content">Conteúdo</Label>
            <Textarea
              id="pm-content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ex.: Oi {nome}! Sua avaliação está confirmada para {data} às {hora}."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Criar e vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
