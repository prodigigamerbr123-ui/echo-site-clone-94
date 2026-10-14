import { usePageTitle } from "@/hooks/usePageTitle";
import { useEvaluationAgendaMetrics } from "@/hooks/useEvaluationAgendaMetrics";
import { errorMessage } from "@/lib/errorMessage";
import { elapsedEvaluationDays, evaluationDaysOverdue, needsEvaluation } from "@/lib/evaluationDue";
import { useAgendaClock } from "@/hooks/useAgendaClock";
import { evaluationDayLabel } from "@/lib/evaluationAgendaDates";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { confirm as askConfirm } from "@/components/ui/confirm-dialog-store";
import { useToast } from "@/hooks/use-toast";
import { useEvaluationAgendaQueries } from "@/hooks/useEvaluationAgendaQueries";
import { useEvaluationAgendaActions } from "@/hooks/useEvaluationAgendaActions";
import { fmtDateISOSP, fmtDateSP, fmtTimeSP, spDate, spDateKey, spIsToday, spParts, spStartOfDay } from "@/lib/spTime";

import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

interface Student {
  id: string;
  name: string;
  phone: string;
  status: string;
  had_evaluation: boolean;
  last_evaluation_date: string | null;
  created_at: string;
}

interface Evaluation {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  completed_at: string | null;
  students?: { name: string; phone: string } | null;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export default function AgendarAvaliacao() {
  usePageTitle("Agendar Avaliação");
  const { toast } = useToast();
  const { saving, schedule, finish, invalidate } = useEvaluationAgendaActions();
  const [searchParams] = useSearchParams();

  // form
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [openStudent, setOpenStudent] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");

  // remarcar dialog
  const [rescheduleTarget, setRescheduleTarget] = useState<Evaluation | null>(null);
  const [rDate, setRDate] = useState("");
  const [rTime, setRTime] = useState("09:00");

  const agendaQueries = useEvaluationAgendaQueries();
  const { data: students, error: studentsError } = agendaQueries.students;

  useEffect(() => {
    const pre = searchParams.get("aluno");
    if (pre && students?.some((s) => s.id === pre)) setStudentId(pre);
  }, [students, searchParams]);

  const { data: evaluations, error: evaluationsError } = agendaQueries.evaluations;

  const settingsQuery = agendaQueries.settings;
  let daysOverdue: number | null = null;
  let deadlineError: unknown = settingsQuery.error;
  if (!deadlineError && settingsQuery.data) {
    try { daysOverdue = evaluationDaysOverdue(settingsQuery.data.evaluation_invite?.params?.days_overdue); }
    catch (error) { deadlineError = error; }
  }
  const dueError = deadlineError || studentsError || evaluationsError;
  const dueReady = !dueError && daysOverdue !== null && students !== undefined && evaluations !== undefined;
  const now = useAgendaClock();
  const futureStudentIds = new Set((evaluations ?? []).filter(e =>
    e.status === "scheduled" && Date.parse(e.scheduled_at) >= now).map(e => e.student_id));
  const dueStudents = dueReady ? students.filter(s =>
    needsEvaluation(s, daysOverdue!, futureStudentIds.has(s.id), now)) : [];

  const selected = useMemo(
    () => students?.find((s) => s.id === studentId),
    [students, studentId],
  );

  const scheduledFuture = useMemo(
    () => (evaluations || []).filter(
      (e) => e.status === "scheduled" && new Date(e.scheduled_at) >= spStartOfDay(new Date(now)),
    ),
    [evaluations, now],
  );

  const stats = useEvaluationAgendaMetrics(evaluations, now);

  // fila de vencidos (top 20 mais antigos, excluindo quem já tem avaliação futura)
  const overdueQueue = dueStudents
      .sort((a, b) => {
        const aRef = a.last_evaluation_date || a.created_at;
        const bRef = b.last_evaluation_date || b.created_at;
        return new Date(aRef).getTime() - new Date(bRef).getTime();
      })
      .slice(0, 20);

  // agrupar por dia
  const grouped = useMemo(() => {
    const groups: Record<string, Evaluation[]> = {};
    for (const ev of scheduledFuture) {
      const key = spDateKey(new Date(ev.scheduled_at));
      (groups[key] ||= []).push(ev);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledFuture]);

  // avaliações "para fechar" (hoje ou já passaram, ainda scheduled)
  const pendingClose = useMemo(
    () => (evaluations || []).filter(
      (e) => e.status === "scheduled" && Date.parse(e.scheduled_at) < now && !spIsToday(new Date(e.scheduled_at), new Date(now)),
    ),
    [evaluations, now],
  );

  async function scheduleFor(student: Student, whenIso: string, notesText: string, ignoreEvaluationId?: string) {
    const result = await schedule(student.id, student.name, new Date(whenIso), notesText || null, ignoreEvaluationId, async (check) => {
      const dup = check.duplicate;
      if (dup) {
        const w = `${fmtDateSP(new Date(dup.scheduled_at))} às ${fmtTimeSP(new Date(dup.scheduled_at))}`;
        toast({
          title: "Aluno já possui avaliação agendada",
          description: `Este aluno já tem uma avaliação agendada para ${w}. Cancele ou remarque antes de criar outra.`,
          variant: "destructive",
        });
        return null;
      }

      let allowConflict = false;
      if (check.conflict) {
        const conflict = check.conflict;
        const exact = Date.parse(conflict.scheduled_at) === Date.parse(whenIso);
        const timeLabel = fmtTimeSP(new Date(conflict.scheduled_at));
        const ok = await askConfirm({
          title: exact ? "Horário já ocupado" : "Conflito de horário",
          description: `Já existe avaliação de ${conflict.student_name} às ${timeLabel}${exact ? " exatamente neste horário" : " (raio de 30 min)"}. Deseja agendar assim mesmo?`,
          confirmLabel: "Agendar mesmo assim",
        });
        if (!ok) return null;
        allowConflict = true;
      }

      return allowConflict;
    });
    return result?.messages_created ?? null;
  }

  const handleCreate = async () => {
    if (!selected) return toast({ title: "Selecione um aluno", variant: "destructive" });
    if (!date) return toast({ title: "Escolha uma data", variant: "destructive" });
    if (!isValidCalendarDate(date)) {
      return toast({ title: "Data inválida", description: "Escolha uma data válida no calendário.", variant: "destructive" });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return toast({ title: "Horário inválido", description: "Informe um horário entre 00:00 e 23:59.", variant: "destructive" });
    }
    const [cy, cmo, cd] = date.split("-").map(Number);
    const [ch, cmi] = time.split(":").map(Number);
    const when = spDate(cy, cmo - 1, cd, ch, cmi);
    try {
      const messagesCreated = await scheduleFor(selected, when.toISOString(), notes);
      if (messagesCreated === null) return; // cancelado pelo usuário / bloqueado
      const whenLabel = `${fmtDateSP(when)} às ${fmtTimeSP(when)}`;
      toast({
        title: "Avaliação agendada",
        description: messagesCreated > 0
          ? `${selected.name} — ${whenLabel}. ${messagesCreated} ${messagesCreated === 1 ? "mensagem automática criada" : "mensagens automáticas criadas"}.`
          : `${selected.name} — ${whenLabel}.`,
      });

      setStudentId(""); setDate(""); setTime("09:00"); setNotes("");
    } catch (e: unknown) {
      toast({ title: "Erro ao agendar", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleCancel = async (ev: Evaluation) => {
    const ok = await askConfirm({
      title: `Cancelar avaliação${ev.students?.name ? " de " + ev.students.name : ""}?`,
      description: "Os lembretes ainda não enviados serão cancelados. Envios já iniciados podem chegar ao aluno.",
      confirmLabel: "Cancelar avaliação",
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await finish(ev.id, ev.students?.name ?? "aluno", "cancel");
      toast({ title: "Avaliação cancelada", description: result.in_flight ? "Há envio já iniciado; ele pode chegar ao aluno. Confira no WhatsApp." : "Lembretes ainda não enviados foram cancelados." });
    } catch (e) {
      toast({ title: "Erro ao cancelar", description: errorMessage(e), variant: "destructive" });
    }
  };

  const openReschedule = (ev: Evaluation) => {
    const d = new Date(ev.scheduled_at);
    const p = spParts(d);
    setRescheduleTarget(ev);
    setRDate(`${p.y}-${String(p.mo + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`);
    setRTime(`${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`);
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget) return;
    if (!rDate) return toast({ title: "Escolha data", variant: "destructive" });
    if (!isValidCalendarDate(rDate)) {
      return toast({ title: "Data inválida", description: "Escolha uma data válida no calendário.", variant: "destructive" });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rTime)) {
      return toast({ title: "Horário inválido", description: "Informe um horário entre 00:00 e 23:59.", variant: "destructive" });
    }
    const [ry, rmo, rdd] = rDate.split("-").map(Number);
    const [rh, rmi] = rTime.split(":").map(Number);
    const when = spDate(ry, rmo - 1, rdd, rh, rmi);
    if (when <= new Date()) {
      return toast({ title: "Data inválida", variant: "destructive" });
    }
    try {
      const student = students?.find((s) => s.id === rescheduleTarget.student_id);
      if (!student) throw new Error("Aluno não encontrado");
      const created = await scheduleFor(student, when.toISOString(), rescheduleTarget.notes ?? "", rescheduleTarget.id);
      if (created === null) return;
      toast({ title: "Avaliação remarcada", description: "Lembretes substituídos. Um envio já iniciado pode chegar ao aluno; confira no WhatsApp." });
      setRescheduleTarget(null);
    } catch (e: unknown) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleDone = async (ev: Evaluation) => {
    try {
      const result = await finish(ev.id, ev.students?.name ?? "aluno", "completed");
      const followupScheduled = result.messages_created > 0;
      toast({
        title: "Avaliação marcada como realizada",
        description: followupScheduled ? "Follow-up agendado." : "Follow-up não agendado (automação desligada ou já existente).",
      });
    } catch (e: unknown) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleNoShow = async (ev: Evaluation) => {
    const ok = await askConfirm({
      title: `Marcar${ev.students?.name ? " " + ev.students.name : ""} como faltou?`,
      description: "Uma mensagem de remarcação será agendada automaticamente para amanhã.",
      confirmLabel: "Registrar falta",
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await finish(ev.id, ev.students?.name ?? "aluno", "no_show");
      const rescheduled = result.messages_created > 0;
      toast({
        title: "Falta registrada",
        description: rescheduled ? "Mensagem de remarcação agendada." : "Remarcação automática desligada.",
      });
    } catch (e: unknown) {
      toast({ title: "Erro", description: errorMessage(e), variant: "destructive" });
    }
  };

  const today = fmtDateISOSP(new Date(now));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-primary to-primary/70 rounded-lg shadow-lg">
          <CalendarPlus className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">Agenda de Avaliações Físicas</h1>
          <p className="text-muted-foreground">
            Compromissos reais + mensagens automáticas geradas pra cada agendamento
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Agendadas</p>
            <p className="text-2xl font-bold text-primary">{stats.scheduled}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Hoje</p>
            <p className="text-2xl font-bold text-success">{stats.today}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Precisam de avaliação</p>
            <p className="text-2xl font-bold text-warning">{dueReady ? dueStudents.length : "—"}</p>
            {daysOverdue !== null && <p className="text-xs text-muted-foreground">Mais de {daysOverdue} dias; primeira avaliação após 14 dias</p>}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Faltas no mês</p>
            <p className="text-2xl font-bold text-destructive">{stats.noShowMonth}</p>
          </CardContent>
        </Card>
      </div>

      {/* Fechar avaliações passadas */}
      {pendingClose.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Avaliações para fechar ({pendingClose.length})
            </CardTitle>
            <CardDescription>Marque como realizada ou faltou pra manter o histórico correto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingClose.map((ev) => (
              <div key={ev.id} className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-background p-3">
                <div className="min-w-0 break-words">
                  <p className="font-medium">{ev.students?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateSP(new Date(ev.scheduled_at))} às {fmtTimeSP(new Date(ev.scheduled_at))} • {ev.students?.phone}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleDone(ev)} disabled={saving}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Realizada
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleNoShow(ev)} disabled={saving}>
                    <XCircle className="h-3 w-3 mr-1" /> Faltou
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Coluna esquerda: Nova avaliação + fila de vencidos */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-primary" />
                Nova Avaliação
              </CardTitle>
              <CardDescription>Compromisso real + 3 mensagens automáticas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Aluno</Label>
                <Popover open={openStudent} onOpenChange={setOpenStudent}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {selected ? (
                        <span className="flex items-center gap-2 truncate">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {selected.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecione um aluno...</span>
                      )}
                      <Search className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar por nome ou telefone..."
                        value={studentSearch}
                        onValueChange={setStudentSearch}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum aluno.</CommandEmpty>
                        <CommandGroup>
                          {students
                            ?.filter((s) => s.status === "active")
                            .filter((s) => {
                              const q = studentSearch.toLowerCase();
                              return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
                            })
                            .slice(0, 100)
                            .map((s) => (
                              <CommandItem
                                key={s.id}
                                value={s.id}
                                onSelect={() => { setStudentId(s.id); setOpenStudent(false); }}
                              >
                                <div className="flex flex-col">
                                  <span>{s.name}</span>
                                  <span className="text-xs text-muted-foreground">{s.phone}</span>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="date">Data</Label>
                  <Input id="date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="time">Horário</Label>
                  <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <Button className="w-full" onClick={handleCreate} disabled={saving}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                {saving ? "Agendando..." : "Agendar Avaliação"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Fila de Vencidos
              </CardTitle>
              <CardDescription>Até 20 alunos ativos, sem avaliação futura. {daysOverdue !== null && `Reavaliação após mais de ${daysOverdue} dias; primeira avaliação após 14 dias de cadastro.`}</CardDescription>
            </CardHeader>
            <CardContent>
              {dueError ? (
                <div role="alert" className="space-y-2 text-sm text-destructive">
                  <p>Não foi possível calcular quem precisa de avaliação. {errorMessage(dueError)}</p>
                  <Button variant="outline" size="sm" onClick={() => {
                    invalidate();
                  }}>Tentar novamente</Button>
                </div>
              ) : !dueReady ? (
                <p role="status" className="text-sm text-muted-foreground py-6">Carregando alunos e prazo de avaliação…</p>
              ) : overdueQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nada vencido — 👏</p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {overdueQueue.map((s) => {
                    const ref = s.last_evaluation_date || s.created_at;
                    const days = Math.floor(elapsedEvaluationDays(ref, now));
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-accent/40">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.last_evaluation_date ? `há ${days} dias` : `nunca avaliado (${days}d)`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStudentId(s.id);
                            document.getElementById("date")?.focus();
                          }}
                        >
                          Agendar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita: Agenda por dia */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Agenda
            </CardTitle>
            <CardDescription>Avaliações futuras agrupadas por dia.</CardDescription>
          </CardHeader>
          <CardContent>
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Activity className="h-10 w-10 mb-2 opacity-40" />
                <p>Nenhuma avaliação agendada.</p>
              </div>
            ) : (
              <div className="space-y-6 max-h-[720px] overflow-y-auto pr-1">
                {grouped.map(([day, items]) => (
                  <div key={day}>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {evaluationDayLabel(day, new Date(now))}
                    </h3>
                    <div className="space-y-2">
                      {items.map((ev) => {
                        const when = new Date(ev.scheduled_at);
                        const canClose = spIsToday(when, new Date(now)) || when.getTime() < now;
                        return (
                          <div key={ev.id} className="rounded-lg border p-3 hover:bg-accent/40 transition-colors">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-primary" />
                                  <span className="font-semibold">{fmtTimeSP(when)}</span>
                                  <span className="font-medium">{ev.students?.name}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {ev.students?.phone}
                                  {ev.notes ? ` • ${ev.notes}` : ""}
                                </p>
                              </div>
                              <div className="flex gap-1 flex-wrap">
                                {canClose && (
                                  <>
                                    <Button size="sm" onClick={() => handleDone(ev)} disabled={saving}>
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> Realizada
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleNoShow(ev)} disabled={saving}>
                                      <XCircle className="h-3 w-3 mr-1" /> Faltou
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" variant="outline" onClick={() => openReschedule(ev)}>
                                  <RefreshCw className="h-3 w-3 mr-1" /> Remarcar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleCancel(ev)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog Remarcar */}
      <Dialog open={!!rescheduleTarget} onOpenChange={(o) => { if (!o && !saving) setRescheduleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remarcar avaliação</DialogTitle>
            <DialogDescription>
              {rescheduleTarget?.students?.name} — novas mensagens automáticas serão geradas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date">Data</Label>
              <Input id="reschedule-date" type="date" disabled={saving} value={rDate} min={today} onChange={(e) => setRDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-time">Horário</Label>
              <Input id="reschedule-time" type="time" disabled={saving} value={rTime} onChange={(e) => setRTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmReschedule} disabled={saving}>
              {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
