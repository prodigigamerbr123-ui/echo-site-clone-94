import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Activity, Search, Filter, Edit, CalendarPlus, CheckCircle2, AlertCircle, Phone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface Student {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  last_evaluation_date: string | null;
  had_evaluation: boolean;
  evaluation_notes: string | null;
  created_at: string;
}

const isOverdue = (dateStr: string | null) => {
  if (!dateStr) return false;
  const last = new Date(dateStr);
  const diffDays = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
};

export default function AvaliacaoFisica() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Student | null>(null);
  const [formDate, setFormDate] = useState<string>("");
  const [formStatus, setFormStatus] = useState<boolean>(false);
  const [formNotes, setFormNotes] = useState<string>("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextEvalDate, setNextEvalDate] = useState("");
  const [followUpType, setFollowUpType] = useState<"reminder" | "followup">("reminder");
  const [saving, setSaving] = useState(false);

  const { data: students, isLoading } = useQuery({
    queryKey: ["students-evaluation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("last_evaluation_date", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as Student[];
    },
  });

  const filtered = students?.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "done" && s.had_evaluation) ||
      (statusFilter === "pending" && !s.had_evaluation) ||
      (statusFilter === "overdue" && isOverdue(s.last_evaluation_date));
    return matchSearch && matchStatus;
  });

  const stats = {
    total: students?.length || 0,
    done: students?.filter((s) => s.had_evaluation).length || 0,
    pending: students?.filter((s) => !s.had_evaluation).length || 0,
    overdue: students?.filter((s) => isOverdue(s.last_evaluation_date)).length || 0,
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setFormDate(s.last_evaluation_date ?? "");
    setFormStatus(s.had_evaluation);
    setFormNotes(s.evaluation_notes ?? "");
    setScheduleNext(false);
    setNextEvalDate("");
    setFollowUpType("reminder");
  };

  const openSchedule = (s: Student) => {
    setEditing(s);
    setFormDate(s.last_evaluation_date ?? "");
    setFormStatus(s.had_evaluation);
    setFormNotes(s.evaluation_notes ?? "");
    setScheduleNext(true);
    setNextEvalDate("");
    setFollowUpType("reminder");
  };

  const handleSave = async () => {
    if (!editing) return;

    if (scheduleNext) {
      if (!nextEvalDate) {
        toast({ title: "Defina a data da próxima avaliação", variant: "destructive" });
        return;
      }
      if (new Date(`${nextEvalDate}T09:00:00`) <= new Date()) {
        toast({ title: "Data inválida", description: "A próxima avaliação deve ser futura.", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({
          last_evaluation_date: formDate || null,
          had_evaluation: formStatus,
          evaluation_notes: formNotes || null,
        })
        .eq("id", editing.id);

      if (error) throw error;

      if (scheduleNext && nextEvalDate) {
        const scheduledFor = new Date(`${nextEvalDate}T09:00:00`);
        const content = followUpType === "reminder"
          ? `Olá ${editing.name}! 📋 Lembrete: sua avaliação física está marcada para hoje. Vamos lá! 💪`
          : `Olá ${editing.name}! 📈 Como foi sua avaliação física? Vamos acompanhar sua evolução juntos! 💪`;

        const { error: schedError } = await supabase.from("scheduled_messages").insert([{
          student_id: editing.id,
          content,
          scheduled_for: scheduledFor.toISOString(),
          message_type: followUpType === "reminder" ? "evaluation_reminder" : "evaluation_followup",
          status: "pending",
        }]);
        if (schedError) throw schedError;
      }

      queryClient.invalidateQueries({ queryKey: ["students-evaluation"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      toast({
        title: scheduleNext ? "Avaliação agendada" : "Avaliação atualizada",
        description: `Dados de ${editing.name} salvos com sucesso.`,
      });
      setEditing(null);
    } catch (e: any) {
      toast({
        title: "Erro ao salvar",
        description: e.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendReminder = (s: Student) => {
    const message = `Olá ${s.name}, está na hora de agendar sua avaliação física! Vamos marcar?`;
    navigate(`/enviar-mensagem?phone=${encodeURIComponent(s.phone)}&message=${encodeURIComponent(message)}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary to-primary/70 rounded-lg shadow-lg">
            <Activity className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Avaliação Física</h1>
            <p className="text-muted-foreground">
              Gerencie a saúde e avaliações dos alunos
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total de Alunos</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Realizadas</p>
            <p className="text-2xl font-bold text-success">{stats.done}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-destructive">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vencidas (+90d)</p>
            <p className="text-2xl font-bold text-warning">{stats.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Alunos e Avaliações
          </CardTitle>
          <CardDescription>
            Visualize, edite e agende avaliações físicas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-4 flex-col sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="done">Realizadas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="overdue">Vencidas (+90 dias)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Última Avaliação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const overdue = isOverdue(s.last_evaluation_date);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {s.phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.last_evaluation_date ? (
                            <span className={overdue ? "text-warning font-medium" : ""}>
                              {format(new Date(s.last_evaluation_date), "dd/MM/yyyy", {
                                locale: ptBR,
                              })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.had_evaluation ? (
                            <Badge className="bg-success/15 text-success hover:bg-success/20 gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Realizada
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                          {s.evaluation_notes || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                              <Edit className="h-3 w-3 mr-1" />
                              Editar
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => openSchedule(s)}>
                              <CalendarPlus className="h-3 w-3 mr-1" />
                              Agendar
                            </Button>
                            {!s.had_evaluation && (
                              <Button size="sm" onClick={() => handleSendReminder(s)}>
                                <Phone className="h-3 w-3 mr-1" />
                                Lembrete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum aluno encontrado.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edição / agendamento */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {scheduleNext ? "Agendar Avaliação" : "Avaliação Física"} — {editing?.name}
            </DialogTitle>
            <DialogDescription>
              {scheduleNext
                ? "Defina a data da próxima avaliação e o tipo de acompanhamento."
                : "Atualize os dados da avaliação física do aluno."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Última avaliação */}
            <div className="space-y-2">
              <Label htmlFor="eval-date">Data da última avaliação</Label>
              <Input
                id="eval-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Avaliação realizada</Label>
                <p className="text-xs text-muted-foreground">
                  Marque se o aluno já realizou a avaliação.
                </p>
              </div>
              <Switch checked={formStatus} onCheckedChange={setFormStatus} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eval-notes">Observações</Label>
              <Textarea
                id="eval-notes"
                placeholder="Ex: Precisa de acompanhamento muscular..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Agendar próxima avaliação */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarPlus className="h-4 w-4 text-primary" />
                  <Label>Agendar próxima avaliação</Label>
                </div>
                <Switch checked={scheduleNext} onCheckedChange={setScheduleNext} />
              </div>

              {scheduleNext && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="next-eval" className="text-xs">Data <span className="text-destructive">*</span></Label>
                    <Input
                      id="next-eval"
                      type="date"
                      value={nextEvalDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setNextEvalDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de acompanhamento</Label>
                    <Select value={followUpType} onValueChange={(v: "reminder" | "followup") => setFollowUpType(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reminder">Lembrete de avaliação</SelectItem>
                        <SelectItem value="followup">Mensagem de acompanhamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : scheduleNext ? "Agendar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
