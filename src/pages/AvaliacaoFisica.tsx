import { matchesStudentSearch } from "@/lib/studentSearch";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { performedDateLabel } from "@/lib/evaluationPerformedDate";
import { evaluationDateLabel } from "@/lib/evaluationAgendaDates";
import { fetchEvaluationHistory } from "@/lib/evaluationHistory";
import { useNavigate } from "react-router-dom";
import { History, Search, CheckCircle2, XCircle, CalendarPlus, Ban, CalendarClock } from "lucide-react";

import { saveEvaluationNotes } from "@/lib/evaluationNotes";
import { errorMessage } from "@/lib/errorMessage";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Evaluation {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  completed_at: string | null;
  performed_on?: string | null;
  students?: { name: string; phone: string } | null;
}

const statusBadge = (s: string) => {
  switch (s) {
    case "completed": return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 gap-1"><CheckCircle2 className="h-3 w-3" />Realizada</Badge>;
    case "no_show": return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Faltou</Badge>;
    case "cancelled": return <Badge variant="secondary" className="gap-1"><Ban className="h-3 w-3" />Cancelada</Badge>;
    case "scheduled": return <Badge className="gap-1">Agendada</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
};

export default function AvaliacaoFisica() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("history");
  const [editing, setEditing] = useState<Evaluation | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const { data: evaluations, isLoading, isError, refetch } = useQuery({
    queryKey: ["evaluations-history"],
    queryFn: fetchEvaluationHistory,
  });

  const filtered = (evaluations || []).filter((e) => {
    const matchS = matchesStudentSearch(e.students, search);
    let matchSt = true;
    if (statusFilter === "history") matchSt = e.status !== "scheduled";
    else if (statusFilter !== "all") matchSt = e.status === statusFilter;
    return matchS && matchSt;
  });

  const stats = {
    completed: (evaluations || []).filter(e => e.status === "completed").length,
    noShow: (evaluations || []).filter(e => e.status === "no_show").length,
    cancelled: (evaluations || []).filter(e => e.status === "cancelled").length,
  };

  const saveNotes = async () => {
    if (!editing || savingRef.current) return;
    savingRef.current = true;
    setNotesError(null);
    setSaving(true);
    try {
      await saveEvaluationNotes(editing.id, editing.notes, notes);
      void queryClient.invalidateQueries({ queryKey: ["evaluations-history"] });
      void queryClient.invalidateQueries({ queryKey: ["evaluations-list"] });
      toast({ title: "Observações salvas" });
      setEditing(null);
    } catch (error) {
      const message = errorMessage(error);
      setNotesError(message);
      toast({ title: "Erro ao salvar observações", description: message, variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (isError) return <div role="alert" className="space-y-3">
    <p>Não foi possível carregar o histórico completo de avaliações.</p>
    <Button onClick={() => void refetch()}>Tentar novamente</Button>
  </div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg"><History className="h-6 w-6 text-primary-foreground" /></div>
          <div>
            <h1 className="text-3xl font-bold">Histórico de Avaliações</h1>
            <p className="text-muted-foreground">Consulte o histórico e edite observações. Para agendar ou fechar, use a Agenda.</p>
          </div>
        </div>
        <Button onClick={() => navigate("/agendar-avaliacao")} className="gap-2">
          <CalendarPlus className="h-4 w-4" /> Ir para a Agenda
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Realizadas</p><p className="text-2xl font-bold text-green-600">{stats.completed}</p></CardContent></Card>
        <Card className="border-l-4 border-l-destructive"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Faltas</p><p className="text-2xl font-bold text-destructive">{stats.noShow}</p></CardContent></Card>
        <Card className="border-l-4 border-l-muted"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Canceladas</p><p className="text-2xl font-bold text-muted-foreground">{stats.cancelled}</p></CardContent></Card>
      </div>

      {(() => {
        const upcoming = (evaluations || [])
          .filter(e => e.status === "scheduled")
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
        return (
          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Avaliações agendadas ({upcoming.length})
              </CardTitle>
              <CardDescription>Compromissos ainda em aberto na Agenda. Exibindo os primeiros {Math.min(20, upcoming.length)} de {upcoming.length}.</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-sm">Nenhuma avaliação agendada.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aluno</TableHead>
                        <TableHead>Agendada para</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcoming.slice(0, 20).map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{ev.students?.name}</p>
                              <p className="text-xs text-muted-foreground">{ev.students?.phone}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{evaluationDateLabel(ev.scheduled_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => navigate("/agendar-avaliacao")}>Abrir Agenda</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Histórico de compromissos e observações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="history">Histórico (fechadas)</SelectItem>
                <SelectItem value="completed">Só realizadas</SelectItem>
                <SelectItem value="no_show">Só faltas</SelectItem>
                <SelectItem value="cancelled">Só canceladas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">Nenhum registro.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Agendada para</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Atendimento em</TableHead>
                    <TableHead>Baixa registrada em</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{ev.students?.name}</p>
                          <p className="text-xs text-muted-foreground">{ev.students?.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{evaluationDateLabel(ev.scheduled_at)}</TableCell>
                      <TableCell>{statusBadge(ev.status)}</TableCell>
                      <TableCell className="text-sm">{ev.status === "completed" ? ev.performed_on ? performedDateLabel(ev.performed_on) : "Não informado (registro antigo)" : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ev.completed_at ? evaluationDateLabel(ev.completed_at, false) : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{ev.notes || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setNotesError(null); setEditing(ev); setNotes(ev.notes || ""); }}>Editar obs.</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !savingRef.current) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observações da avaliação</DialogTitle>
            <DialogDescription>{editing?.students?.name} — {editing && evaluationDateLabel(editing.scheduled_at)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {notesError && <p role="alert" className="text-sm text-destructive">{notesError}</p>}
            <Label htmlFor="evaluation-notes">Notas</Label>
            <Textarea id="evaluation-notes" disabled={saving} value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Peso, medidas, objetivos, observações..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveNotes} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
