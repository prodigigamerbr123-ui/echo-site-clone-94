import { EvaluationAgendaList } from "@/components/avaliacoes/EvaluationAgendaList";
import { EvaluationDueQueue } from "@/components/avaliacoes/EvaluationDueQueue";
import { EvaluationRescheduleDialog } from "@/components/avaliacoes/EvaluationRescheduleDialog";
import { EvaluationScheduleForm } from "@/components/avaliacoes/EvaluationScheduleForm";
import { PendingEvaluations } from "@/components/avaliacoes/PendingEvaluations";
import type {
  AgendaEvaluation,
  AgendaStudent,
  EvaluationFormValues,
} from "@/components/avaliacoes/agendaTypes";
import { Card, CardContent } from "@/components/ui/card";
import { confirm as askConfirm } from "@/components/ui/confirm-dialog-store";
import { useToast } from "@/hooks/use-toast";
import { useAgendaClock } from "@/hooks/useAgendaClock";
import { useEvaluationAgendaActions } from "@/hooks/useEvaluationAgendaActions";
import { useEvaluationAgendaMetrics } from "@/hooks/useEvaluationAgendaMetrics";
import { useEvaluationAgendaQueries } from "@/hooks/useEvaluationAgendaQueries";
import { usePageTitle } from "@/hooks/usePageTitle";
import { errorMessage } from "@/lib/errorMessage";
import { evaluationDaysOverdue, needsEvaluation } from "@/lib/evaluationDue";
import {
  fmtDateISOSP,
  fmtDateSP,
  fmtTimeSP,
  spDate,
  spDateKey,
  spIsToday,
  spParts,
  spStartOfDay,
} from "@/lib/spTime";
import { CalendarPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export default function AgendarAvaliacao() {
  usePageTitle("Agendar Avaliação");
  const { toast } = useToast();
  const { saving, schedule, finish, invalidate } = useEvaluationAgendaActions();
  const [searchParams] = useSearchParams();
  const appliedPreselection = useRef<string | null>(null);

  const [form, setForm] = useState<EvaluationFormValues>({
    studentId: "",
    date: "",
    time: "09:00",
    notes: "",
  });
  const { studentId, date, time, notes } = form;

  // remarcar dialog
  const [rescheduleTarget, setRescheduleTarget] =
    useState<AgendaEvaluation | null>(null);
  const [rDate, setRDate] = useState("");
  const [rTime, setRTime] = useState("09:00");

  const agendaQueries = useEvaluationAgendaQueries();
  const { data: students, error: studentsError } = agendaQueries.students;

  useEffect(() => {
    const pre = searchParams.get("aluno");
    if (!pre) {
      appliedPreselection.current = null;
      return;
    }
    if (appliedPreselection.current === pre) return;
    if (students?.some((s) => s.id === pre)) {
      appliedPreselection.current = pre;
      setForm((previous) => ({ ...previous, studentId: pre }));
    }
  }, [students, searchParams]);

  const { data: evaluations, error: evaluationsError } =
    agendaQueries.evaluations;
  const evaluationsReady = !evaluationsError && evaluations !== undefined;

  const settingsQuery = agendaQueries.settings;
  let daysOverdue: number | null = null;
  let deadlineError: unknown = settingsQuery.error;
  if (!deadlineError && settingsQuery.data) {
    try {
      daysOverdue = evaluationDaysOverdue(
        settingsQuery.data.evaluation_invite?.params?.days_overdue,
      );
    } catch (error) {
      deadlineError = error;
    }
  }
  const dueError = deadlineError || studentsError || evaluationsError;
  const dueReady =
    !dueError &&
    daysOverdue !== null &&
    students !== undefined &&
    evaluations !== undefined;
  const now = useAgendaClock();
  const futureStudentIds = new Set(
    (evaluations ?? [])
      .filter(
        (e) => e.status === "scheduled" && Date.parse(e.scheduled_at) >= now,
      )
      .map((e) => e.student_id),
  );
  const dueStudents = dueReady
    ? students.filter((s) =>
        needsEvaluation(s, daysOverdue!, futureStudentIds.has(s.id), now),
      )
    : [];

  const selected = useMemo(
    () => students?.find((s) => s.id === studentId),
    [students, studentId],
  );

  const scheduledFuture = useMemo(
    () =>
      (evaluations || []).filter(
        (e) =>
          e.status === "scheduled" &&
          new Date(e.scheduled_at) >= spStartOfDay(new Date(now)),
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
    const groups: Record<string, AgendaEvaluation[]> = {};
    for (const ev of scheduledFuture) {
      const key = spDateKey(new Date(ev.scheduled_at));
      (groups[key] ||= []).push(ev);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledFuture]);

  // avaliações "para fechar" (hoje ou já passaram, ainda scheduled)
  const pendingClose = useMemo(
    () =>
      (evaluations || []).filter(
        (e) =>
          e.status === "scheduled" &&
          Date.parse(e.scheduled_at) < now &&
          !spIsToday(new Date(e.scheduled_at), new Date(now)),
      ),
    [evaluations, now],
  );

  async function scheduleFor(
    student: AgendaStudent,
    whenIso: string,
    notesText: string,
    ignoreEvaluationId?: string,
  ) {
    const result = await schedule(
      student.id,
      student.name,
      new Date(whenIso),
      notesText || null,
      ignoreEvaluationId,
      async (check) => {
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
          const exact =
            Date.parse(conflict.scheduled_at) === Date.parse(whenIso);
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
      },
    );
    return result?.messages_created ?? null;
  }

  const handleCreate = async () => {
    if (!selected)
      return toast({ title: "Selecione um aluno", variant: "destructive" });
    if (!date)
      return toast({ title: "Escolha uma data", variant: "destructive" });
    if (!isValidCalendarDate(date)) {
      return toast({
        title: "Data inválida",
        description: "Escolha uma data válida no calendário.",
        variant: "destructive",
      });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return toast({
        title: "Horário inválido",
        description: "Informe um horário entre 00:00 e 23:59.",
        variant: "destructive",
      });
    }
    const [cy, cmo, cd] = date.split("-").map(Number);
    const [ch, cmi] = time.split(":").map(Number);
    const when = spDate(cy, cmo - 1, cd, ch, cmi);
    try {
      const messagesCreated = await scheduleFor(
        selected,
        when.toISOString(),
        notes,
      );
      if (messagesCreated === null) return; // cancelado pelo usuário / bloqueado
      const whenLabel = `${fmtDateSP(when)} às ${fmtTimeSP(when)}`;
      toast({
        title: "Avaliação agendada",
        description:
          messagesCreated > 0
            ? `${selected.name} — ${whenLabel}. ${messagesCreated} ${messagesCreated === 1 ? "mensagem automática criada" : "mensagens automáticas criadas"}.`
            : `${selected.name} — ${whenLabel}.`,
      });

      setForm({ studentId: "", date: "", time: "09:00", notes: "" });
    } catch (e: unknown) {
      toast({
        title: "Erro ao agendar",
        description: errorMessage(e),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (ev: AgendaEvaluation) => {
    const ok = await askConfirm({
      title: `Cancelar avaliação${ev.students?.name ? " de " + ev.students.name : ""}?`,
      description:
        "Os lembretes ainda não enviados serão cancelados. Envios já iniciados podem chegar ao aluno.",
      confirmLabel: "Cancelar avaliação",
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await finish(
        ev.id,
        ev.students?.name ?? "aluno",
        "cancel",
      );
      toast({
        title: "Avaliação cancelada",
        description: result.in_flight
          ? "Há envio já iniciado; ele pode chegar ao aluno. Confira no WhatsApp."
          : "Lembretes ainda não enviados foram cancelados.",
      });
    } catch (e) {
      toast({
        title: "Erro ao cancelar",
        description: errorMessage(e),
        variant: "destructive",
      });
    }
  };

  const openReschedule = (ev: AgendaEvaluation) => {
    const d = new Date(ev.scheduled_at);
    const p = spParts(d);
    setRescheduleTarget(ev);
    setRDate(
      `${p.y}-${String(p.mo + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`,
    );
    setRTime(
      `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`,
    );
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget) return;
    if (!rDate) return toast({ title: "Escolha data", variant: "destructive" });
    if (!isValidCalendarDate(rDate)) {
      return toast({
        title: "Data inválida",
        description: "Escolha uma data válida no calendário.",
        variant: "destructive",
      });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rTime)) {
      return toast({
        title: "Horário inválido",
        description: "Informe um horário entre 00:00 e 23:59.",
        variant: "destructive",
      });
    }
    const [ry, rmo, rdd] = rDate.split("-").map(Number);
    const [rh, rmi] = rTime.split(":").map(Number);
    const when = spDate(ry, rmo - 1, rdd, rh, rmi);
    if (when <= new Date()) {
      return toast({ title: "Data inválida", variant: "destructive" });
    }
    try {
      const student = students?.find(
        (s) => s.id === rescheduleTarget.student_id,
      );
      if (!student) throw new Error("Aluno não encontrado");
      const created = await scheduleFor(
        student,
        when.toISOString(),
        rescheduleTarget.notes ?? "",
        rescheduleTarget.id,
      );
      if (created === null) return;
      toast({
        title: "Avaliação remarcada",
        description:
          "Lembretes substituídos. Um envio já iniciado pode chegar ao aluno; confira no WhatsApp.",
      });
      setRescheduleTarget(null);
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: errorMessage(e),
        variant: "destructive",
      });
    }
  };

  const handleDone = async (ev: AgendaEvaluation) => {
    try {
      const result = await finish(
        ev.id,
        ev.students?.name ?? "aluno",
        "completed",
      );
      const followupScheduled = result.messages_created > 0;
      toast({
        title: "Avaliação marcada como realizada",
        description: followupScheduled
          ? "Follow-up agendado."
          : "Follow-up não agendado (automação desligada ou já existente).",
      });
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: errorMessage(e),
        variant: "destructive",
      });
    }
  };

  const handleNoShow = async (ev: AgendaEvaluation) => {
    const ok = await askConfirm({
      title: `Marcar${ev.students?.name ? " " + ev.students.name : ""} como faltou?`,
      description:
        "Uma mensagem de remarcação será agendada automaticamente para amanhã.",
      confirmLabel: "Registrar falta",
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await finish(
        ev.id,
        ev.students?.name ?? "aluno",
        "no_show",
      );
      const rescheduled = result.messages_created > 0;
      toast({
        title: "Falta registrada",
        description: rescheduled
          ? "Mensagem de remarcação agendada."
          : "Remarcação automática desligada.",
      });
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: errorMessage(e),
        variant: "destructive",
      });
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
          <h1 className="text-2xl sm:text-3xl font-bold break-words">
            Agenda de Avaliações Físicas
          </h1>
          <p className="text-muted-foreground">
            Compromissos reais + mensagens automáticas geradas pra cada
            agendamento
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Agendadas</p>
            <p className="text-2xl font-bold text-primary">
              {evaluationsReady ? stats.scheduled : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Hoje</p>
            <p className="text-2xl font-bold text-success">
              {evaluationsReady ? stats.today : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Precisam de avaliação
            </p>
            <p className="text-2xl font-bold text-warning">
              {dueReady ? dueStudents.length : "—"}
            </p>
            {daysOverdue !== null && (
              <p className="text-xs text-muted-foreground">
                Mais de {daysOverdue} dias; primeira avaliação após 14 dias
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Faltas no mês</p>
            <p className="text-2xl font-bold text-destructive">
              {evaluationsReady ? stats.noShowMonth : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <PendingEvaluations
        evaluations={pendingClose}
        saving={saving}
        onDone={handleDone}
        onNoShow={handleNoShow}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Coluna esquerda: Nova avaliação + fila de vencidos */}
        <div className="lg:col-span-2 space-y-6">
          <EvaluationScheduleForm
            students={students}
            selected={selected}
            values={form}
            today={today}
            saving={saving}
            studentsLoading={agendaQueries.students.isPending}
            studentsError={studentsError}
            onChange={(update) =>
              setForm((previous) => ({ ...previous, ...update }))
            }
            onSubmit={handleCreate}
            onRetry={() => {
              void agendaQueries.students.refetch();
            }}
          />

          <EvaluationDueQueue
            overdueQueue={overdueQueue}
            dueError={dueError}
            dueReady={dueReady}
            daysOverdue={daysOverdue}
            now={now}
            onRetry={invalidate}
            onSelectStudent={(studentId) => {
              setForm((previous) => ({ ...previous, studentId }));
              document.getElementById("date")?.focus();
            }}
          />
        </div>

        {/* Coluna direita: Agenda por dia */}
        <EvaluationAgendaList
          grouped={grouped}
          now={now}
          saving={saving}
          error={evaluationsError}
          isLoading={agendaQueries.evaluations.isPending}
          onRetry={() => {
            void agendaQueries.evaluations.refetch();
          }}
          onDone={handleDone}
          onNoShow={handleNoShow}
          onReschedule={openReschedule}
          onCancel={handleCancel}
        />
      </div>

      {/* Dialog Remarcar */}
      <EvaluationRescheduleDialog
        rescheduleTarget={rescheduleTarget}
        rDate={rDate}
        rTime={rTime}
        today={today}
        saving={saving}
        onDateChange={setRDate}
        onTimeChange={setRTime}
        onClose={() => setRescheduleTarget(null)}
        onSubmit={confirmReschedule}
      />
    </div>
  );
}
