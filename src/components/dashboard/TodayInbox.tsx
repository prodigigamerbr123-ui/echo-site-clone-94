import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Cake, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  buildFollowup, buildReschedule,
} from "@/lib/evaluationMessages";

interface Evaluation {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: string;
  students?: { name: string; phone: string } | null;
}

export function TodayInbox() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: todayEvals = [] } = useQuery({
    queryKey: ["today-evaluations"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("evaluations")
        .select("id, student_id, scheduled_at, status, students(name, phone)")
        .eq("status", "scheduled")
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .order("scheduled_at");
      return (data || []) as Evaluation[];
    },
    refetchInterval: 60_000,
  });

  const { data: birthdays = [] } = useQuery({
    queryKey: ["today-birthdays"],
    queryFn: async () => {
      const { data: students } = await supabase.from("students")
        .select("id, name, birth_date").not("birth_date", "is", null);
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const todays = (students || []).filter((s: any) => {
        if (!s.birth_date) return false;
        const [, m, d] = s.birth_date.split("-");
        return m === mm && d === dd;
      });
      if (todays.length === 0) return [];
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { data: msgs } = await supabase.from("scheduled_messages")
        .select("student_id, status")
        .eq("message_type", "birthday")
        .gte("scheduled_for", start.toISOString())
        .lte("scheduled_for", end.toISOString());
      const byStudent = new Map<string, string>();
      for (const m of msgs || []) byStudent.set((m as any).student_id, (m as any).status);
      return todays.map((s: any) => ({ ...s, msgStatus: byStudent.get(s.id) }));
    },
    refetchInterval: 60_000,
  });

  const { data: attention } = useQuery({
    queryKey: ["today-attention"],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
      const [{ data: failed }, { data: overdue }] = await Promise.all([
        supabase.from("scheduled_messages")
          .select("id, content, failure_reason, students(name)")
          .eq("status", "failed").gte("updated_at", dayAgo.toISOString()).limit(5),
        supabase.from("students").select("id, last_evaluation_date, had_evaluation, created_at, status")
          .eq("status", "active"),
      ]);
      const overdueCount = (overdue || []).filter((s: any) => {
        if (s.last_evaluation_date) {
          return (Date.now() - new Date(s.last_evaluation_date).getTime()) / 86400000 > 90;
        }
        return !s.had_evaluation && (Date.now() - new Date(s.created_at).getTime()) / 86400000 > 14;
      }).length;
      return { failed: failed || [], overdueCount };
    },
    refetchInterval: 60_000,
  });

  const markDone = async (ev: Evaluation) => {
    const evalDate = new Date(ev.scheduled_at);
    await supabase.from("scheduled_messages").delete()
      .eq("evaluation_id", ev.id).eq("status", "pending");
    await Promise.all([
      supabase.from("evaluations").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", ev.id),
      supabase.from("students").update({
        had_evaluation: true, last_evaluation_date: format(evalDate, "yyyy-MM-dd"),
      }).eq("id", ev.student_id),
    ]);
    const { data: existing } = await supabase.from("scheduled_messages").select("id")
      .eq("student_id", ev.student_id).eq("message_type", "evaluation_followup")
      .eq("status", "pending").limit(1);
    if (!existing?.length) {
      const fu = new Date(evalDate.getTime() + 7 * 86400000);
      fu.setHours(9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
      await supabase.from("scheduled_messages").insert({
        student_id: ev.student_id,
        content: buildFollowup(ev.students?.name ?? "aluno"),
        scheduled_for: fu.toISOString(),
        message_type: "evaluation_followup", status: "pending", evaluation_id: ev.id,
      });
    }
    toast({ title: "Avaliação realizada" });
    qc.invalidateQueries({ queryKey: ["today-evaluations"] });
  };

  const markNoShow = async (ev: Evaluation) => {
    await supabase.from("scheduled_messages").delete().eq("evaluation_id", ev.id).eq("status", "pending");
    await supabase.from("evaluations").update({ status: "no_show" }).eq("id", ev.id);
    const t = new Date(); t.setDate(t.getDate() + 1);
    t.setHours(9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
    await supabase.from("scheduled_messages").insert({
      student_id: ev.student_id,
      content: buildReschedule(ev.students?.name ?? "aluno"),
      scheduled_for: t.toISOString(),
      message_type: "evaluation_reschedule", status: "pending", evaluation_id: ev.id,
    });
    toast({ title: "Falta registrada" });
    qc.invalidateQueries({ queryKey: ["today-evaluations"] });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Avaliações de hoje ({todayEvals.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {todayEvals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma avaliação hoje.</p>
          ) : (
            todayEvals.map((ev) => (
              <div key={ev.id} className="rounded-lg border p-2 space-y-1">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ev.students?.name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(ev.scheduled_at), "HH:mm")}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 flex-1" onClick={() => markDone(ev)}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />Realizada
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 flex-1" onClick={() => markNoShow(ev)}>
                    <XCircle className="h-3 w-3 mr-1" />Faltou
                  </Button>
                </div>
              </div>
            ))
          )}
          <Button asChild variant="outline" size="sm" className="w-full mt-2">
            <Link to="/agendar-avaliacao">Ir para a Agenda <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cake className="h-4 w-4 text-pink-500" /> Aniversariantes de hoje ({birthdays.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ninguém aniversariando 🎂</p>
          ) : (
            birthdays.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <p className="text-sm font-medium truncate">{s.name}</p>
                {s.msgStatus === "sent" ? (
                  <Badge className="text-xs bg-green-500/15 text-green-600 border-green-500/30">Mensagem enviada</Badge>
                ) : s.msgStatus === "pending" ? (
                  <Badge variant="secondary" className="text-xs">Agendada</Badge>
                ) : s.msgStatus === "failed" ? (
                  <Badge variant="destructive" className="text-xs">Falhou</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Sem mensagem</Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Precisa de atenção
          </CardTitle>
          <CardDescription className="text-xs">Falhas 24h e alunos vencidos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(attention?.failed?.length ?? 0) === 0 && (attention?.overdueCount ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Tudo em ordem 👏</p>
          ) : (
            <>
              {(attention?.failed || []).map((f: any) => (
                <div key={f.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                  <p className="text-xs font-medium truncate">{f.students?.name} — falhou</p>
                  <p className="text-[11px] text-destructive truncate">{f.failure_reason || "Erro no envio"}</p>
                </div>
              ))}
              {(attention?.failed?.length ?? 0) > 0 && (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/mensagens-agendadas">Ver mensagens falhas</Link>
                </Button>
              )}
              {(attention?.overdueCount ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 flex items-center justify-between gap-2">
                  <p className="text-sm">
                    <strong className="text-amber-700">{attention?.overdueCount}</strong> aluno(s) vencidos
                  </p>
                  <Button asChild size="sm" variant="ghost" className="h-7">
                    <Link to="/agendar-avaliacao">Agendar</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
