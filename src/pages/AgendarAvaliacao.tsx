import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow, isPast, startOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarPlus,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Activity,
  CalendarClock,
  AlertTriangle,
  Trash2,
  RefreshCw,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { confirm as askConfirm } from "@/components/ui/confirm-dialog";
import {
  buildEvaluationMessages,
  buildFollowup,
  buildReschedule,
  AUTO_EVAL_MESSAGE_TYPES,
} from "@/lib/evaluationMessages";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

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

const isOverdue = (dateStr: string | null) => {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000 > 90;
};

// deleta mensagens automáticas ainda pendentes de uma avaliação
async function deletePendingEvalMessages(evaluationId: string) {
  await supabase
    .from("scheduled_messages")
    .delete()
    .eq("evaluation_id", evaluationId)
    .eq("status", "pending");
}

export default function AgendarAvaliacao() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // form
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [openStudent, setOpenStudent] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // remarcar dialog
  const [rescheduleTarget, setRescheduleTarget] = useState<Evaluation | null>(null);
  const [rDate, setRDate] = useState("");
  const [rTime, setRTime] = useState("09:00");

  const { data: students } = useQuery({
    queryKey: ["students-evaluation-agenda"],
    queryFn: async () => {
      const pageSize = 1000;
      let all: Student[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("students")
          .select("id,name,phone,status,had_evaluation,last_evaluation_date,created_at")
          .order("name", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data as Student[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const { data: evaluations } = useQuery({
    queryKey: ["evaluations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id,student_id,scheduled_at,status,notes,completed_at,students(name,phone)")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as Evaluation[];
    },
  });

  const selected = useMemo(
    () => students?.find((s) => s.id === studentId),
    [students, studentId],
  );

  const scheduledFuture = useMemo(
    () => (evaluations || []).filter(
      (e) => e.status === "scheduled" && new Date(e.scheduled_at) >= startOfDay(new Date()),
    ),
    [evaluations],
  );

  const stats = useMemo(() => {
    const scheduled = scheduledFuture.length;
    const today = (evaluations || []).filter(
      (e) => e.status === "scheduled" && isToday(new Date(e.scheduled_at)),
    ).length;
    const activeStudents = (students || []).filter((s) => s.status === "active");
    const studentsWithFuture = new Set(
      scheduledFuture.map((e) => e.student_id),
    );
    const overdue = activeStudents.filter((s) => {
      if (studentsWithFuture.has(s.id)) return false;
      if (s.last_evaluation_date) return isOverdue(s.last_evaluation_date);
      return !s.had_evaluation && differenceInDays(new Date(), new Date(s.created_at)) > 14;
    }).length;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const noShowMonth = (evaluations || []).filter(
      (e) => e.status === "no_show" && new Date(e.scheduled_at) >= monthStart,
    ).length;
    return { scheduled, today, overdue, noShowMonth };
  }, [evaluations, students, scheduledFuture]);

  // fila de vencidos (top 20 mais antigos, excluindo quem já tem avaliação futura)
  const overdueQueue = useMemo(() => {
    const studentsWithFuture = new Set(scheduledFuture.map((e) => e.student_id));
    const candidates = (students || [])
      .filter((s) => s.status === "active" && !studentsWithFuture.has(s.id))
      .filter((s) => {
        if (s.last_evaluation_date) return isOverdue(s.last_evaluation_date);
        return !s.had_evaluation && differenceInDays(new Date(), new Date(s.created_at)) > 14;
      })
      .sort((a, b) => {
        const aRef = a.last_evaluation_date || a.created_at;
        const bRef = b.last_evaluation_date || b.created_at;
        return new Date(aRef).getTime() - new Date(bRef).getTime();
      });
    return candidates.slice(0, 20);
  }, [students, scheduledFuture]);

  // agrupar por dia
  const grouped = useMemo(() => {
    const groups: Record<string, Evaluation[]> = {};
    for (const ev of scheduledFuture) {
      const key = format(new Date(ev.scheduled_at), "yyyy-MM-dd");
      (groups[key] ||= []).push(ev);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledFuture]);

  // avaliações "para fechar" (hoje ou já passaram, ainda scheduled)
  const pendingClose = useMemo(
    () => (evaluations || []).filter(
      (e) => e.status === "scheduled" && new Date(e.scheduled_at) < new Date() && !isToday(new Date(e.scheduled_at)),
    ),
    [evaluations],
  );

  function dayLabel(dateStr: string) {
    const d = new Date(`${dateStr}T12:00:00`);
    if (isToday(d)) return "Hoje";
    if (isTomorrow(d)) return "Amanhã";
    return format(d, "EEEE, dd 'de' MMMM", { locale: ptBR });
  }

  async function scheduleFor(student: Student, whenIso: string, notesText: string) {
    // Trava duplicidade
    const alreadyFuture = scheduledFuture.find((e) => e.student_id === student.id);
    if (alreadyFuture) {
      const w = format(new Date(alreadyFuture.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR });
      const ok = await askConfirm({
        title: `${student.name} já tem avaliação`,
        description: `Existe agendamento em ${w}. Criar outro para o mesmo aluno?`,
        confirmLabel: "Criar mesmo assim",
      });
      if (!ok) return;
    }

    // Trava conflito de horário (30 min)
    const target = new Date(whenIso).getTime();
    const conflictEv = scheduledFuture.find((e) => {
      const d = new Date(e.scheduled_at).getTime();
      return Math.abs(d - target) < 30 * 60 * 1000 && e.student_id !== student.id;
    });
    if (conflictEv) {
      const w = format(new Date(conflictEv.scheduled_at), "HH:mm");
      const ok = await askConfirm({
        title: "Conflito de horário",
        description: `Já existe avaliação de ${conflictEv.students?.name ?? "outro aluno"} às ${w} (raio de 30 min). Prosseguir?`,
        confirmLabel: "Agendar mesmo assim",
      });
      if (!ok) return;
    }

    const { data: created, error } = await supabase
      .from("evaluations")
      .insert({
        student_id: student.id,
        scheduled_at: whenIso,
        status: "scheduled",
        notes: notesText || null,
      })
      .select("id")
      .single();
    if (error) throw error;

    // 3 mensagens automáticas
    const auto = buildEvaluationMessages(student.name, new Date(whenIso));
    if (auto.length > 0) {
      await supabase.from("scheduled_messages").insert(
        auto.map((m) => ({
          student_id: student.id,
          content: m.content,
          scheduled_for: m.scheduled_for,
          message_type: m.message_type,
          status: "pending",
          evaluation_id: created!.id,
        })),
      );
    }
  }

  const handleCreate = async () => {
    if (!selected) return toast({ title: "Selecione um aluno", variant: "destructive" });
    if (!date) return toast({ title: "Escolha uma data", variant: "destructive" });
    const when = new Date(`${date}T${time || "09:00"}:00`);
    if (when <= new Date()) {
      return toast({ title: "Data inválida", description: "Deve ser no futuro.", variant: "destructive" });
    }
    setSaving(true);
    try {
      await scheduleFor(selected, when.toISOString(), notes);
      toast({
        title: "Avaliação agendada",
        description: `${selected.name} — ${format(when, "dd/MM 'às' HH:mm", { locale: ptBR })}. 3 mensagens automáticas criadas.`,
      });
      setStudentId(""); setDate(""); setTime("09:00"); setNotes("");
      qc.invalidateQueries({ queryKey: ["evaluations-list"] });
      qc.invalidateQueries({ queryKey: ["scheduled-messages"] });
    } catch (e: any) {
      toast({ title: "Erro ao agendar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (ev: Evaluation) => {
    if (!window.confirm(`Cancelar avaliação de ${ev.students?.name ?? ""}?`)) return;
    await deletePendingEvalMessages(ev.id);
    const { error } = await supabase
      .from("evaluations")
      .update({ status: "cancelled" })
      .eq("id", ev.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["evaluations-list"] });
    qc.invalidateQueries({ queryKey: ["scheduled-messages"] });
    toast({ title: "Avaliação cancelada" });
  };

  const openReschedule = (ev: Evaluation) => {
    const d = new Date(ev.scheduled_at);
    setRescheduleTarget(ev);
    setRDate(format(d, "yyyy-MM-dd"));
    setRTime(format(d, "HH:mm"));
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget) return;
    if (!rDate) return toast({ title: "Escolha data", variant: "destructive" });
    const when = new Date(`${rDate}T${rTime || "09:00"}:00`);
    if (when <= new Date()) {
      return toast({ title: "Data inválida", variant: "destructive" });
    }
    setSaving(true);
    try {
      await deletePendingEvalMessages(rescheduleTarget.id);
      const { error } = await supabase
        .from("evaluations")
        .update({ scheduled_at: when.toISOString(), status: "scheduled" })
        .eq("id", rescheduleTarget.id);
      if (error) throw error;

      const auto = buildEvaluationMessages(rescheduleTarget.students?.name ?? "aluno", when);
      if (auto.length > 0) {
        await supabase.from("scheduled_messages").insert(
          auto.map((m) => ({
            student_id: rescheduleTarget.student_id,
            content: m.content,
            scheduled_for: m.scheduled_for,
            message_type: m.message_type,
            status: "pending",
            evaluation_id: rescheduleTarget.id,
          })),
        );
      }
      qc.invalidateQueries({ queryKey: ["evaluations-list"] });
      qc.invalidateQueries({ queryKey: ["scheduled-messages"] });
      toast({ title: "Avaliação remarcada" });
      setRescheduleTarget(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDone = async (ev: Evaluation) => {
    setSaving(true);
    try {
      await deletePendingEvalMessages(ev.id);
      const evalDate = new Date(ev.scheduled_at);
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("evaluations").update({
          status: "completed", completed_at: new Date().toISOString(),
        }).eq("id", ev.id),
        supabase.from("students").update({
          had_evaluation: true,
          last_evaluation_date: format(evalDate, "yyyy-MM-dd"),
        }).eq("id", ev.student_id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      // Checar se já existe followup pendente
      const { data: existingFu } = await supabase
        .from("scheduled_messages")
        .select("id")
        .eq("student_id", ev.student_id)
        .eq("message_type", "evaluation_followup")
        .eq("status", "pending")
        .limit(1);

      if (!existingFu || existingFu.length === 0) {
        const followup = new Date(evalDate.getTime() + 7 * 86400000);
        followup.setHours(9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
        await supabase.from("scheduled_messages").insert({
          student_id: ev.student_id,
          content: buildFollowup(ev.students?.name ?? "aluno"),
          scheduled_for: followup.toISOString(),
          message_type: "evaluation_followup",
          status: "pending",
          evaluation_id: ev.id,
        });
      }

      qc.invalidateQueries({ queryKey: ["evaluations-list"] });
      qc.invalidateQueries({ queryKey: ["students-evaluation-agenda"] });
      qc.invalidateQueries({ queryKey: ["students-evaluation"] });
      qc.invalidateQueries({ queryKey: ["scheduled-messages"] });
      toast({ title: "Avaliação marcada como realizada", description: "Follow-up de 7 dias agendado." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNoShow = async (ev: Evaluation) => {
    if (!window.confirm(`Marcar ${ev.students?.name ?? ""} como faltou?`)) return;
    setSaving(true);
    try {
      await deletePendingEvalMessages(ev.id);
      const { error } = await supabase
        .from("evaluations").update({ status: "no_show" }).eq("id", ev.id);
      if (error) throw error;

      // Remarcar msg amanhã 09-12h
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
      await supabase.from("scheduled_messages").insert({
        student_id: ev.student_id,
        content: buildReschedule(ev.students?.name ?? "aluno"),
        scheduled_for: tomorrow.toISOString(),
        message_type: "evaluation_reschedule",
        status: "pending",
        evaluation_id: ev.id,
      });
      qc.invalidateQueries({ queryKey: ["evaluations-list"] });
      qc.invalidateQueries({ queryKey: ["scheduled-messages"] });
      toast({ title: "Falta registrada", description: "Mensagem de remarcação enviada para amanhã." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-primary to-primary/70 rounded-lg shadow-lg">
          <CalendarPlus className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Agenda de Avaliações Físicas</h1>
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
            <p className="text-sm text-muted-foreground">Vencidas (+90d)</p>
            <p className="text-2xl font-bold text-warning">{stats.overdue}</p>
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
              <div key={ev.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
                <div>
                  <p className="font-medium">{ev.students?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(ev.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })} • {ev.students?.phone}
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
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto" align="start">
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
              <CardDescription>Top 20 alunos sem avaliação há mais tempo.</CardDescription>
            </CardHeader>
            <CardContent>
              {overdueQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nada vencido — 👏</p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {overdueQueue.map((s) => {
                    const ref = s.last_evaluation_date || s.created_at;
                    const days = differenceInDays(new Date(), new Date(ref));
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
                      {dayLabel(day)}
                    </h3>
                    <div className="space-y-2">
                      {items.map((ev) => {
                        const when = new Date(ev.scheduled_at);
                        const canClose = isToday(when) || isPast(when);
                        return (
                          <div key={ev.id} className="rounded-lg border p-3 hover:bg-accent/40 transition-colors">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-primary" />
                                  <span className="font-semibold">{format(when, "HH:mm")}</span>
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
      <Dialog open={!!rescheduleTarget} onOpenChange={(o) => !o && setRescheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remarcar avaliação</DialogTitle>
            <DialogDescription>
              {rescheduleTarget?.students?.name} — novas mensagens automáticas serão geradas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={rDate} min={today} onChange={(e) => setRDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <Input type="time" value={rTime} onChange={(e) => setRTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>Cancelar</Button>
            <Button onClick={confirmReschedule} disabled={saving}>
              {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Silence unused-import warning for AUTO_EVAL_MESSAGE_TYPES (kept exported for reuse)
void AUTO_EVAL_MESSAGE_TYPES;
