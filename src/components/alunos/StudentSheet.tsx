import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Phone, Calendar, Activity, CalendarPlus, Send, MessageSquare, FileText, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleReengagementIfEnabled } from "@/lib/welcomeReengagement";
import { maskCpfDisplay } from "@/lib/cpf";

interface Student {
  id: string; name: string; phone: string;
  birth_date: string | null; last_evaluation_date: string | null;
  had_evaluation: boolean; status: string; plan: string | null; created_at: string;
  cpf?: string | null; payment_due_date?: string | null;
}

interface Props {
  student: Student | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function StudentSheet({ student, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: nextEval } = useQuery({
    queryKey: ["student-next-eval", student?.id],
    enabled: !!student?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("evaluations")
        .select("id, scheduled_at, status")
        .eq("student_id", student!.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["student-recent-msgs", student?.id],
    enabled: !!student?.id && open,
    queryFn: async () => {
      const [{ data: sent }, { data: sched }] = await Promise.all([
        supabase.from("messages").select("id, content, sent_at, status")
          .eq("student_id", student!.id).order("sent_at", { ascending: false }).limit(10),
        supabase.from("scheduled_messages").select("id, content, scheduled_for, status")
          .eq("student_id", student!.id).eq("status", "pending")
          .order("scheduled_for", { ascending: true }).limit(10),
      ]);
      const items = [
        ...(sched || []).map((m: any) => ({ ...m, kind: "sched" as const, when: m.scheduled_for })),
        ...(sent || []).map((m: any) => ({ ...m, kind: "sent" as const, when: m.sent_at })),
      ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 10);
      return items;
    },
  });

  const toggleStatus = async () => {
    if (!student) return;
    const wasActive = student.status === "active";
    const newStatus = wasActive ? "inactive" : "active";
    const { error } = await supabase.from("students").update({ status: newStatus }).eq("id", student.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    if (wasActive && newStatus === "inactive") {
      await scheduleReengagementIfEnabled(student.id, student.name);
    }
    toast({ title: `Aluno marcado como ${newStatus === "active" ? "ativo" : "inativo"}` });
    qc.invalidateQueries({ queryKey: ["students"] });
    onOpenChange(false);
  };

  if (!student) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{student.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Phone className="h-3 w-3" /> {student.phone}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <span className={student.status === "active" ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {student.status === "active" ? "Ativo" : "Inativo"}
                </span>
                <Switch checked={student.status === "active"} onCheckedChange={toggleStatus} />
              </div>
            </div>
            {student.plan && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plano</span>
                <Badge variant="outline">{student.plan}</Badge>
              </div>
            )}
            {student.birth_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Nascimento</span>
                <span>{format(new Date(student.birth_date), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
            )}
            {student.cpf && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> CPF</span>
                <span className="font-mono text-xs">{maskCpfDisplay(student.cpf)}</span>
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


          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Activity className="h-4 w-4 text-primary" /> Avaliação Física
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Última</span>
              <span>{student.last_evaluation_date
                ? format(new Date(student.last_evaluation_date), "dd/MM/yyyy", { locale: ptBR })
                : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Próxima agendada</span>
              <span>{nextEval
                ? format(new Date(nextEval.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                : "—"}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 font-medium mb-2 text-sm">
              <MessageSquare className="h-4 w-4" /> Últimas mensagens
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Sem histórico.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {recent.map((m: any) => (
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
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { onOpenChange(false); navigate(`/agendar-avaliacao?aluno=${student.id}`); }}>
              <CalendarPlus className="h-4 w-4 mr-2" /> Agendar avaliação
            </Button>
            <Button variant="outline" onClick={() => { onOpenChange(false); navigate(`/mensagens?aluno=${student.id}`); }}>
              <Send className="h-4 w-4 mr-2" /> Enviar mensagem
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
