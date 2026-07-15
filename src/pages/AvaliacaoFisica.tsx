import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { History, Search, CheckCircle2, XCircle, CalendarPlus, Ban } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("history");
  const [editing, setEditing] = useState<Evaluation | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: evaluations, isLoading, refetch } = useQuery({
    queryKey: ["evaluations-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, student_id, scheduled_at, status, notes, completed_at, students(name, phone)")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as Evaluation[];
    },
  });

  const filtered = (evaluations || []).filter((e) => {
    const term = search.toLowerCase();
    const matchS = !term ||
      e.students?.name?.toLowerCase().includes(term) ||
      e.students?.phone?.includes(search);
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
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("evaluations").update({ notes }).eq("id", editing.id);
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Observações salvas" });
    setEditing(null);
    refetch();
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg"><History className="h-6 w-6 text-primary-foreground" /></div>
          <div>
            <h1 className="text-3xl font-bold">Histórico de Avaliações</h1>
            <p className="text-muted-foreground">Somente leitura. Para agendar ou fechar, use a Agenda.</p>
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
                    <TableHead>Fechada em</TableHead>
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
                      <TableCell className="text-sm">{format(new Date(ev.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                      <TableCell>{statusBadge(ev.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ev.completed_at ? format(new Date(ev.completed_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{ev.notes || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(ev); setNotes(ev.notes || ""); }}>Editar obs.</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observações da avaliação</DialogTitle>
            <DialogDescription>{editing?.students?.name} — {editing && format(new Date(editing.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Peso, medidas, objetivos, observações..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveNotes} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
