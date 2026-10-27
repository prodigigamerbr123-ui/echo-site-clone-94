import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { confirm } from "@/components/ui/confirm-dialog-store";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAgendaClock } from "@/hooks/useAgendaClock";
import { supabase } from "@/integrations/supabase/client";
import { maskCpf } from "@/lib/cpf";
import { errorMessage } from "@/lib/errorMessage";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";
import { scheduleReengagementIfEnabled } from "@/lib/welcomeReengagement";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, CalendarClock, CalendarPlus, CreditCard, FileText, MessageSquare, Pencil, Phone, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { paymentStatus, type Student } from "./studentListModel";
import { EditarAlunoDialog } from "./EditarAlunoDialog";
import { RenovarPlanoDialog } from "./RenovarPlanoDialog";
import { StudentPlanHistory } from "./StudentPlanHistory";

const appointmentLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
}).format(new Date(value));

interface Props {
  student: Student | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function StudentSheet({ student: initialStudent, open, onOpenChange }: Props) {
  const { role } = useAuth();
  const canManageStudents = import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK);
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const statusChangeRunning = useRef(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "renew" | null>(null);
  const now = useAgendaClock();
  const { data: freshStudent, isError: recordError, isFetching: recordLoading } = useQuery({
    queryKey: ["student-record", initialStudent?.id],
    enabled: !!initialStudent?.id && open && !dialog,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*")
        .eq("id", initialStudent!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const student = freshStudent ?? initialStudent;
  const recordUnavailable = recordError || freshStudent === null;
  const busy = statusSaving || recordLoading || recordUnavailable;

  const { data: nextEval, isError: nextEvalError, isLoading: nextEvalLoading } = useQuery({
    queryKey: ["student-next-eval", student?.id],
    staleTime: 0,
    enabled: !!student?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("evaluations")
        .select("id, scheduled_at, status")
        .eq("student_id", student!.id)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: recent = [], isError: messagesError, isLoading: messagesLoading } = useQuery({
    queryKey: ["student-recent-msgs", student?.id],
    staleTime: 0,
    enabled: !!student?.id && open && canManageStudents,
    queryFn: async () => {
      const [{ data: sent, error: sentError }, { data: sched, error: schedError }] = await Promise.all([
        supabase.from("messages").select("id, content, sent_at, status")
          .eq("student_id", student!.id).order("sent_at", { ascending: false }).limit(10),
        supabase.from("scheduled_messages").select("id, content, scheduled_for, status")
          .eq("student_id", student!.id).eq("status", "pending")
          .order("scheduled_for", { ascending: true }).limit(10),
      ]);
      if (sentError || schedError) throw sentError || schedError;
      const items = [
        ...(sched || []).map((m) => ({ ...m, kind: "sched" as const, when: m.scheduled_for })),
        ...(sent || []).map((m) => ({ ...m, kind: "sent" as const, when: m.sent_at })),
      ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 10);
      return items;
    },
  });

  const toggleStatus = async (checked: boolean) => {
    if (!student || busy || statusChangeRunning.current || !canManageStudents) return;
    if (checked === (student.status === "active")) return;
    statusChangeRunning.current = true;
    setStatusSaving(true);
    const wasActive = student.status === "active";
    const newStatus = checked ? "active" : "inactive";
    try {
      if (wasActive && !checked) {
        const accepted = await confirm({
          title: "Inativar aluno?",
          description: `${student.name} deixará de aparecer entre os alunos ativos. O histórico e os agendamentos serão preservados. Confira a agenda se precisar cancelar uma avaliação. O reengajamento só será agendado se o aluno permitir mensagens e a automação estiver habilitada.`,
          confirmLabel: "Inativar aluno",
          destructive: true,
        });
        if (!accepted) return;
      }
      const { data, error } = await supabase.from("students")
        .update({ status: newStatus })
        .eq("id", student.id)
        .eq("status", student.status)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({ title: "Aluno alterado em outra tela", description: "Atualize a lista antes de tentar novamente.", variant: "destructive" });
        qc.invalidateQueries({ queryKey: ["students"] });
        return;
      }
      const reengagement = wasActive && !checked && student.messages_enabled !== false
        ? await scheduleReengagementIfEnabled(student.id, student.name)
        : "disabled";
      toast({
        title: `Aluno marcado como ${checked ? "ativo" : "inativo"}`,
        description: reengagement === "failed" ? "Não foi possível agendar a mensagem automática. Verifique as automações." : undefined,
      });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["students-evaluation-agenda"] });
      qc.invalidateQueries({ queryKey: ["students-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["today-actions"] });
      qc.invalidateQueries({ queryKey: ["pending-scheduled-by-student"] });
      qc.invalidateQueries({ queryKey: ["student-recent-msgs", student.id] });
      qc.invalidateQueries({ queryKey: ["student-record", student.id] });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao mudar status", description: errorMessage(error, "Tente novamente."), variant: "destructive" });
    } finally {
      statusChangeRunning.current = false;
      setStatusSaving(false);
    }
  };

  if (!student) return null;
  const due = student.status === "active" ? paymentStatus(student.payment_due_date) : null;
  const evaluationPending = nextEval && Date.parse(nextEval.scheduled_at) < now;
  const closeDialog = (next: boolean) => {
    if (next) return;
    void qc.invalidateQueries({ queryKey: ["student-record", student.id] });
    setDialog(null);
  };
  const openAgenda = () => {
    onOpenChange(false);
    navigate(`/agendar-avaliacao?aluno=${encodeURIComponent(student.id)}`);
  };

  return (
    <>
    <Sheet open={open && !dialog} onOpenChange={(next) => { if (!statusSaving && !dialog) onOpenChange(next); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{student.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Phone className="h-3 w-3" /> {student.phone}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {recordUnavailable && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">
            <p>{freshStudent === null ? "Este cadastro não está mais disponível." : "Não foi possível atualizar a ficha. Confira a conexão antes de alterar o cadastro."}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void qc.invalidateQueries({ queryKey: ["student-record", student.id] })}>Atualizar ficha</Button>
          </div>}
          <section aria-label="Atendimento do aluno" className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-4">
            <h2 className="text-sm font-semibold">Atendimento do aluno</h2>
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span>Prazo do plano</span>{due ? <Badge variant="outline" className={due.cls}>{due.label}</Badge> : <span className="text-muted-foreground">{student.status !== "active" ? "Não acompanhado: aluno inativo" : "Sem vencimento informado"}</span>}</div>
              {due?.key === "overdue" && <p className="text-muted-foreground">Confira com o aluno se o plano precisa ser renovado ou se a data está desatualizada.</p>}
              {student.messages_enabled === false && <p className="rounded-md border p-3 text-muted-foreground">Mensagens desativadas a pedido do aluno. A matrícula e a agenda continuam disponíveis. Para permitir novos envios, use Editar cadastro.</p>}
              {student.status !== "active" && <p className="text-muted-foreground">Aluno inativo. Confira a situação da matrícula antes de combinar o retorno.</p>}
              {nextEvalError ? <p role="alert" className="text-destructive">Não foi possível conferir os agendamentos. Consulte a agenda antes de marcar outra avaliação.</p>
                : nextEvalLoading ? <p role="status" className="text-muted-foreground">Conferindo agendamentos…</p>
                : nextEval ? <p><strong>{evaluationPending ? "Avaliação aguardando baixa: " : "Avaliação agendada: "}</strong>{appointmentLabel(nextEval.scheduled_at)}. {evaluationPending ? "Abra a agenda para registrar o resultado ou remarcar." : "Confira esse compromisso antes de criar outro."}</p>
                : <p className="text-muted-foreground">{student.had_evaluation || student.last_evaluation_date ? "Sem avaliação agendada. Combine o próximo acompanhamento quando necessário." : "Sem avaliação anterior informada e sem agendamento em aberto."}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              {canManageStudents && <Button variant={due?.key === "overdue" || due?.key === "due_soon" ? "default" : "outline"} disabled={busy} onClick={() => setDialog("renew")}><CreditCard className="h-4 w-4 mr-2" /> Renovar plano</Button>}
              <Button variant="outline" disabled={busy || nextEvalLoading} onClick={openAgenda}><CalendarPlus className="h-4 w-4 mr-2" />{nextEval || nextEvalError ? "Abrir agenda" : "Agendar avaliação"}</Button>
              {canManageStudents && <Button variant="outline" disabled={busy} onClick={() => setDialog("edit")}><Pencil className="h-4 w-4 mr-2" /> Editar cadastro</Button>}
              {canManageStudents && <Button variant="outline" disabled={busy || student.messages_enabled === false} onClick={() => { onOpenChange(false); navigate(`/mensagens?aluno=${encodeURIComponent(student.id)}`); }}><Send className="h-4 w-4 mr-2" /> Preparar mensagem</Button>}
            </div>
          </section>
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <h2 className="font-semibold pb-1">Cadastro e matrícula</h2>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <span className={student.status === "active" ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {student.status === "active" ? "Ativo" : "Inativo"}
                </span>
                <Switch aria-label="Alterar status do aluno" checked={student.status === "active"} onCheckedChange={toggleStatus} disabled={!canManageStudents || busy} />
              </div>
            </div>
            {student.plan && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plano</span>
                <Badge variant="outline">{student.plan}</Badge>
              </div>
            )}
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Início na academia</span><span>{student.enrollment_date ? format(new Date(student.enrollment_date + "T12:00:00"), "dd/MM/yyyy") : "Não informado"}</span></div>
            {student.benefit && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Benefício / convênio</span><span className="text-right">{student.benefit}</span></div>}
            {student.birth_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Nascimento</span>
                <span>{format(new Date(student.birth_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
            )}
            {student.cpf && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> CPF</span>
                <span>{maskCpf(student.cpf)}</span>
              </div>
            )}
            {student.payment_due_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Vencimento</span>
                <span>{format(new Date(student.payment_due_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cadastrado em</span>
              <span>{format(new Date(student.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
          </div>

          {canManageStudents && <StudentPlanHistory key={student.id} studentId={student.id} open={open && !dialog} />}

          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Activity className="h-4 w-4 text-primary" /> Avaliação Física
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Última</span>
              <span>{student.last_evaluation_date
                ? format(new Date(student.last_evaluation_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                : "—"}</span>
            </div>
            {student.initial_evaluation_date && <p className="text-xs text-muted-foreground">Avaliação informada no cadastro: {format(new Date(student.initial_evaluation_date + "T12:00:00"), "dd/MM/yyyy")}. Sem atendimento criado no histórico.</p>}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{evaluationPending ? "Aguardando baixa" : "Próxima agendada"}</span>
              <span>{nextEvalError ? "Falha ao consultar" : nextEvalLoading ? "Carregando…" : nextEval
                ? appointmentLabel(nextEval.scheduled_at)
                : "—"}</span>
            </div>
          </div>

          {canManageStudents && <div>
            <div className="flex items-center gap-2 font-medium mb-2 text-sm">
              <MessageSquare className="h-4 w-4" /> Últimas mensagens
            </div>
            {messagesError ? <p role="alert" className="text-sm text-destructive">Não foi possível consultar as mensagens.</p> : messagesLoading ? <p className="text-sm text-muted-foreground">Carregando mensagens…</p> : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Sem histórico.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {recent.map((m) => (
                  <div key={`${m.kind}-${m.id}`} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant={m.kind === "sched" ? "secondary" : "outline"} className="text-[10px]">
                        {m.kind === "sched" ? "Agendada" : m.status === "sent" ? "Enviada" : m.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {format(new Date(m.when), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="line-clamp-2">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>}
        </div>
      </SheetContent>
    </Sheet>
    {open && dialog === "edit" && <EditarAlunoDialog student={student} open onOpenChange={closeDialog} />}
    {open && dialog === "renew" && <RenovarPlanoDialog student={student} open onOpenChange={closeDialog} />}
    </>
  );
}
