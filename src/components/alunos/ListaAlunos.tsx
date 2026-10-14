import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useStudentListColumns } from "@/hooks/useStudentListColumns";
import { useStudentListData } from "@/hooks/useStudentListData";
import { useStudentListFilters } from "@/hooks/useStudentListFilters";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errorMessage";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, CalendarClock, ClipboardList, Columns3, Filter, Search, Users, X } from "lucide-react";
import { useState } from "react";
import { EditarAlunoDialog } from "./EditarAlunoDialog";
import { COLUMN_DEFS, DEFAULT_COLUMNS, type ColumnKey } from "./listaAlunosColumns";
import { type Student } from "./studentListModel";
import { StudentListResults } from "./StudentListResults";
import { StudentQuickFilters } from "./StudentQuickFilters";
import { StudentSheet } from "./StudentSheet";

export function ListaAlunos() {
  const { role } = useAuth();
  const canManageStudents = import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK);
  const canDeleteStudents = import.meta.env.VITE_PREVIEW_MODE === "true" || role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { visibleColumns, setVisibleColumns, toggleColumn, visibleCount } = useStudentListColumns();

  const { students, isLoading, studentsError, pendingScheduled, pendingError } = useStudentListData();
  const {
    searchTerm, setSearchTerm, statusFilter, setStatusFilter,
    paymentFilter, setPaymentFilter, planFilter, setPlanFilter,
    flagFilter, setFlagFilter, sortBy, setSortBy, pendingByStudent,
    isActive, isBirthdayThisMonth, availablePlans, filteredStudents,
    hasActiveFilters, clearFilters,
  } = useStudentListFilters(students, pendingScheduled);

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (deletingId) return;
    const ok = await (await import("@/components/ui/confirm-dialog-store")).confirm({
      title: `Excluir ${studentName}?`,
      description: "Esta ação não pode ser desfeita. Todo o histórico do aluno será perdido.",
      confirmLabel: "Excluir aluno",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(studentId);
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: "Aluno excluído", description: `${studentName} foi removido do sistema.` });
    } catch (error: unknown) {
      toast({ title: "Erro ao excluir aluno", description: errorMessage(error), variant: "destructive" });
    } finally {
      setDeletingId(null);
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

  if (studentsError) {
    return <Card><CardContent className="pt-6" role="alert">
      <p>Não foi possível carregar os alunos. Tente novamente.</p>
      <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["students"] })}>Tentar novamente</Button>
    </CardContent></Card>;
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
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" /> {total} total
              </Badge>
              <Badge className="gap-1 bg-green-500/15 text-green-600 hover:bg-green-500/20 border-green-500/30">
                {activeCount} ativos
              </Badge>
              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                {total - activeCount} inativos
              </Badge>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <Columns3 className="h-4 w-4" />
                    Colunas ({visibleCount})
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Exibir na lista
                  </div>
                  <div className="space-y-1">
                    {COLUMN_DEFS.map((col) => (
                      <label
                        key={col.key}
                        htmlFor={`col-${col.key}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          id={`col-${col.key}`}
                          checked={visibleColumns[col.key]}
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        <span className="text-sm">{col.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-2 pt-2 border-t mt-2 gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs flex-1"
                      onClick={() =>
                        setVisibleColumns(
                          COLUMN_DEFS.reduce((acc, c) => ({ ...acc, [c.key]: true }), {} as Record<ColumnKey, boolean>),
                        )
                      }
                    >
                      Todas
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs flex-1"
                      onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}
                    >
                      Padrão
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingError && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível atualizar as mensagens pendentes. Os indicadores podem estar incompletos.
            </p>
          )}
          <StudentQuickFilters
            students={students}
            pendingByStudent={pendingByStudent}
            isActive={isActive}
            isBirthdayThisMonth={isBirthdayThisMonth}
            paymentFilter={paymentFilter}
            setPaymentFilter={setPaymentFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            flagFilter={flagFilter}
            setFlagFilter={setFlagFilter}
          />

          <div className="flex gap-3 flex-col sm:flex-row flex-wrap">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={(v) => { if (v === "all" || v === "overdue" || v === "due_soon" || v === "ok" || v === "none") setPaymentFilter(v); }}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <CalendarClock className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo pagamento</SelectItem>
                <SelectItem value="overdue">Vencidos</SelectItem>
                <SelectItem value="due_soon">Vence em 3 dias</SelectItem>
                <SelectItem value="ok">Em dia</SelectItem>
                <SelectItem value="none">Sem data</SelectItem>
              </SelectContent>
            </Select>
            {availablePlans.length > 0 && (
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os planos</SelectItem>
                  {availablePlans.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={sortBy} onValueChange={(v) => { if (v === "recent" || v === "name" || v === "due" || v === "last_eval") setSortBy(v); }}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
                <SelectItem value="due">Vencimento (mais próximo)</SelectItem>
                <SelectItem value="last_eval">Última avaliação</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredStudents.length} aluno(s) encontrado(s)
          </div>

          {filteredStudents.length > 0 ? (
            <StudentListResults
              filteredStudents={filteredStudents}
              visibleColumns={visibleColumns}
              pendingByStudent={pendingByStudent}
              canManageStudents={canManageStudents}
              canDeleteStudents={canDeleteStudents}
              deletingId={deletingId}
              setViewingStudent={setViewingStudent}
              setEditingStudent={setEditingStudent}
              handleDeleteStudent={handleDeleteStudent}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {hasActiveFilters
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

      <StudentSheet
        student={viewingStudent}
        open={!!viewingStudent}
        onOpenChange={(o) => !o && setViewingStudent(null)}
      />
    </div>
  );
}
