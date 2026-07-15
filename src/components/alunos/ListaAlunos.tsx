import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, Edit, Trash2, Phone, Calendar, ArrowUpDown, Users, Bell, Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditarAlunoDialog } from "./EditarAlunoDialog";
import { StudentSheet } from "./StudentSheet";

interface Student {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  last_evaluation_date: string | null;
  had_evaluation: boolean;
  created_at: string;
  plan: string | null;
  status: string;
}

const ACTIVE_DAYS = 30;

export function ListaAlunos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);

  const { data: students, isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const pageSize = 1000;
      let all: Student[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data as Student[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    }
  });

  // Mensagens recentes para determinar atividade e pendências
  const { data: recentMessages = [] } = useQuery({
    queryKey: ['recent-messages-status'],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - ACTIVE_DAYS);
      const { data } = await supabase
        .from('messages')
        .select('student_id, sent_at')
        .gte('sent_at', since.toISOString());
      return data || [];
    }
  });

  const { data: pendingScheduled = [] } = useQuery({
    queryKey: ['pending-scheduled-by-student'],
    queryFn: async () => {
      const { data } = await supabase
        .from('scheduled_messages')
        .select('student_id')
        .eq('status', 'pending');
      return data || [];
    }
  });

  const activeStudentIds = new Set(recentMessages.map((m: any) => m.student_id));
  const pendingByStudent = pendingScheduled.reduce((acc: Record<string, number>, m: any) => {
    acc[m.student_id] = (acc[m.student_id] || 0) + 1;
    return acc;
  }, {});

  const isActive = (s: Student) => s.status === 'active';

  const filteredStudents = (students || [])
    .filter(s => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term ||
        s.name.toLowerCase().includes(term) ||
        s.phone.includes(searchTerm);
      const active = isActive(s);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    const ok = await (await import("@/components/ui/confirm-dialog")).confirm({
      title: `Excluir ${studentName}?`,
      description: "Esta ação não pode ser desfeita. Todo o histórico do aluno será perdido.",
      confirmLabel: "Excluir aluno",
      destructive: true,
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: "Aluno excluído", description: `${studentName} foi removido do sistema.` });
    } catch (error: any) {
      toast({ title: "Erro ao excluir aluno", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = students?.length || 0;
  const activeCount = (students || []).filter(isActive).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Lista de Alunos
              </CardTitle>
              <CardDescription>
                Gerencie todos os alunos cadastrados na academia
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" /> {total} total
              </Badge>
              <Badge className="gap-1 bg-green-500/15 text-green-600 hover:bg-green-500/20 border-green-500/30">
                {activeCount} ativos
              </Badge>
              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                {total - activeCount} inativos
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: "recent" | "name") => setSortBy(v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredStudents.length} aluno(s) encontrado(s)
          </div>

          {/* Tabela */}
          {filteredStudents.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Aniversário</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const active = isActive(student);
                    const pendingCount = pendingByStudent[student.id] || 0;
                    return (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{student.name}</span>
                            {pendingCount > 0 && (
                              <Badge variant="outline" className="gap-1 text-xs border-amber-500/40 text-amber-600">
                                <Bell className="h-3 w-3" />
                                {pendingCount}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {student.phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          {student.birth_date ? (
                            <div className="flex items-center gap-2 text-sm">
                              <Cake className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(student.birth_date), "dd/MM", { locale: ptBR })}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {student.plan ? (
                            <Badge variant="outline" className="text-xs">{student.plan}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(student.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {active ? (
                            <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/20 border-green-500/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground mr-1.5" />
                              Inativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingStudent(student)}
                              title="Editar aluno"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteStudent(student.id, student.name)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Excluir aluno"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm || statusFilter !== "all"
                ? "Nenhum aluno encontrado com os filtros aplicados."
                : "Nenhum aluno cadastrado ainda."}
            </div>
          )}
        </CardContent>
      </Card>

      {editingStudent && (
        <EditarAlunoDialog
          student={editingStudent}
          open={!!editingStudent}
          onOpenChange={(open) => !open && setEditingStudent(null)}
        />
      )}
    </div>
  );
}
