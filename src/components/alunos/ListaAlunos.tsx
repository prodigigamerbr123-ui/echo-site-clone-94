
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, Edit, Trash2, Phone, Calendar, Cake, CheckSquare, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditarAlunoDialog } from "./EditarAlunoDialog";

interface Student {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  last_evaluation_date: string | null;
  had_evaluation: boolean;
  created_at: string;
}

export function ListaAlunos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const { data: students, isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Student[];
    }
  });

  const filteredStudents = students?.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.phone.includes(searchTerm);
    
    const matchesFilter = filterType === "all" ||
                         (filterType === "with-evaluation" && student.had_evaluation) ||
                         (filterType === "without-evaluation" && !student.had_evaluation) ||
                         (filterType === "with-birthday" && student.birth_date) ||
                         (filterType === "without-birthday" && !student.birth_date);

    return matchesSearch && matchesFilter;
  });

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o aluno ${studentName}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      toast({
        title: "Aluno excluído",
        description: `${studentName} foi removido do sistema.`,
      });
    } catch (error: any) {
      console.error('Error deleting student:', error);
      toast({
        title: "Erro ao excluir aluno",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedStudents.length === 0) return;

    const studentsToDelete = filteredStudents?.filter(s => selectedStudents.includes(s.id)) || [];
    const studentNames = studentsToDelete.map(s => s.name).join(', ');

    if (!confirm(`Tem certeza que deseja excluir ${selectedStudents.length} aluno(s)? (${studentNames})\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .in('id', selectedStudents);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      
      setSelectedStudents([]);

      toast({
        title: "Alunos excluídos",
        description: `${selectedStudents.length} aluno(s) foram removidos do sistema.`,
      });
    } catch (error: any) {
      console.error('Error deleting students:', error);
      toast({
        title: "Erro ao excluir alunos",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === filteredStudents?.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents?.map(s => s.id) || []);
    }
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Lista de Alunos
          </CardTitle>
          <CardDescription>
            Gerencie todos os alunos cadastrados na academia
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-4 flex-col sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os alunos</SelectItem>
                <SelectItem value="with-evaluation">Com avaliação</SelectItem>
                <SelectItem value="without-evaluation">Sem avaliação</SelectItem>
                <SelectItem value="with-birthday">Com aniversário</SelectItem>
                <SelectItem value="without-birthday">Sem aniversário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resultados e Ações em Massa */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {filteredStudents?.length || 0} aluno(s) encontrado(s)
              {selectedStudents.length > 0 && (
                <span className="ml-2 text-primary">
                  ({selectedStudents.length} selecionado(s))
                </span>
              )}
            </div>
            
            {filteredStudents && filteredStudents.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-xs"
                >
                  {selectedStudents.length === filteredStudents.length ? (
                    <>
                      <CheckSquare className="h-3 w-3 mr-1" />
                      Desmarcar Todos
                    </>
                  ) : (
                    <>
                      <Square className="h-3 w-3 mr-1" />
                      Selecionar Todos
                    </>
                  )}
                </Button>
                
                {selectedStudents.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    className="text-xs"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Excluir Selecionados ({selectedStudents.length})
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Tabela */}
          {filteredStudents && filteredStudents.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedStudents.length === filteredStudents?.length && filteredStudents.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border border-input"
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Aniversário</TableHead>
                    <TableHead>Avaliação</TableHead>
                    <TableHead>Última Avaliação</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id} className={selectedStudents.includes(student.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.id)}
                          onChange={() => handleSelectStudent(student.id)}
                          className="rounded border border-input"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {student.phone}
                        </div>
                      </TableCell>
                      <TableCell>
                        {student.birth_date ? (
                          <div className="flex items-center gap-2">
                            <Cake className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(student.birth_date), "dd/MM", { locale: ptBR })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={student.had_evaluation ? "default" : "secondary"}>
                          {student.had_evaluation ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {student.last_evaluation_date ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(student.last_evaluation_date), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(student.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingStudent(student)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteStudent(student.id, student.name)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || filterType !== "all" 
                ? "Nenhum aluno encontrado com os filtros aplicados."
                : "Nenhum aluno cadastrado ainda."
              }
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Edição */}
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
