import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, Edit, Trash2, Phone, Calendar, ArrowUpDown, Users, Bell, Cake, MapPin, Send, CalendarPlus, AlertCircle, Columns3, IdCard, CalendarClock } from "lucide-react";
import { maskCpf } from "@/lib/cpf";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditarAlunoDialog } from "./EditarAlunoDialog";
import { StudentSheet } from "./StudentSheet";
import { replaceNameVar } from "@/lib/phone";
import { resolveAutomationMessage } from "@/lib/messageTemplates";
import { confirm } from "@/components/ui/confirm-dialog";

type ColumnKey = "phone" | "cpf" | "city" | "birthday" | "plan" | "created" | "dueDate" | "payment" | "status";
const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: "phone", label: "WhatsApp" },
  { key: "cpf", label: "CPF" },
  { key: "city", label: "Cidade" },
  { key: "birthday", label: "Aniversário" },
  { key: "plan", label: "Plano" },
  { key: "created", label: "Cadastrado em" },
  { key: "dueDate", label: "Vencimento" },
  { key: "payment", label: "Pagamento" },
  { key: "status", label: "Status" },
];
const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  phone: true, cpf: false, city: true, birthday: true, plan: true, created: true, dueDate: true, payment: true, status: true,
};
const COLUMNS_STORAGE_KEY = "alunos:visibleColumns:v2";

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
  city: string | null;
  payment_due_date: string | null;
  cpf: string | null;
}

const ACTIVE_DAYS = 30;

function paymentStatus(due: string | null) {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T12:00:00");
  const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: "Vencido", cls: "bg-red-500/15 text-red-600 border-red-500/30" };
  if (diffDays <= 3) return { label: `Vence em ${diffDays}d`, cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  return { label: "Em dia", cls: "bg-green-500/15 text-green-600 border-green-500/30" };
}

export function ListaAlunos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [chargingOverdue, setChargingOverdue] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (!raw) return DEFAULT_COLUMNS;
      return { ...DEFAULT_COLUMNS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch { /* ignore */ }
  }, [visibleColumns]);
  const toggleColumn = (k: ColumnKey) =>
    setVisibleColumns((prev) => ({ ...prev, [k]: !prev[k] }));
  const visibleCount = Object.values(visibleColumns).filter(Boolean).length;

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

  const overdueStudents = (students || []).filter(
    (s) => isActive(s) && paymentStatus(s.payment_due_date)?.label === "Vencido",
  );

  const handleChargeOverdue = async () => {
    if (overdueStudents.length === 0) return;
    const n = overdueStudents.length;
    const spreadMinutes = n <= 5 ? 0 : n <= 20 ? Math.min(30, n * 2) : n <= 100 ? 60 : Math.ceil(n * 0.6);
    const ok = await confirm({
      title: `Cobrar ${n} aluno(s) vencido(s)?`,
      description: spreadMinutes > 0
        ? `As mensagens serão distribuídas ao longo de ~${spreadMinutes} min para não bloquear o WhatsApp.`
        : "As mensagens serão enviadas nos próximos minutos.",
      confirmLabel: "Cobrar agora",
    });
    if (!ok) return;
    setChargingOverdue(true);
    try {
      const ids = overdueStudents.map((s) => s.id);
      const { data: existing } = await supabase
        .from("scheduled_messages")
        .select("student_id")
        .eq("status", "pending")
        .eq("message_type", "payment_overdue")
        .in("student_id", ids);
      const already = new Set((existing || []).map((r: any) => r.student_id));
      const targets = overdueStudents.filter((s) => !already.has(s.id));
      const skipped = n - targets.length;

      if (targets.length === 0) {
        toast({ title: "Nada a enviar", description: `Todos os ${n} alunos vencidos já têm cobrança na fila.` });
        return;
      }

      const fallback = "Oi {nome}! Notamos que sua mensalidade está em atraso. Podemos te ajudar a regularizar? Qualquer dúvida é só chamar. 💪";
      const now = Date.now();
      const spanMs = spreadMinutes * 60 * 1000;
      const rows = await Promise.all(
        targets.map(async (s, i) => {
          const content = await resolveAutomationMessage(
            "payment_reminder",
            "payment_overdue",
            fallback,
            { nome: s.name },
          );
          const startOffset = 60 * 1000 + Math.floor(Math.random() * 2 * 60 * 1000);
          const spreadOffset = targets.length > 1 && spanMs > 0
            ? Math.floor((spanMs / (targets.length - 1)) * i) + Math.floor(Math.random() * 20000)
            : 0;
          return {
            student_id: s.id,
            content: replaceNameVar(content, s.name),
            scheduled_for: new Date(now + startOffset + spreadOffset).toISOString(),
            message_type: "payment_overdue",
            status: "pending",
          };
        }),
      );

      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) throw error;
      toast({
        title: `${rows.length} cobrança(s) na fila`,
        description: skipped > 0 ? `${skipped} pulado(s) — já havia cobrança pendente.` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["pending-scheduled-by-student"] });
    } catch (e: any) {
      toast({ title: "Erro ao enfileirar", description: e.message, variant: "destructive" });
    } finally {
      setChargingOverdue(false);
    }
  };

  const renderStatusBadge = (active: boolean) =>
    active ? (
      <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/20 border-green-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5" />
        Ativo
      </Badge>
    ) : (
      <Badge variant="secondary" className="text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground mr-1.5" />
        Inativo
      </Badge>
    );

  const ActionButtons = ({ student }: { student: Student }) => (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={() => navigate(`/mensagens?aluno=${student.id}`)}
        aria-label={`Enviar mensagem para ${student.name}`}
        title="Enviar mensagem"
      >
        <Send className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={() => navigate(`/agendar-avaliacao?aluno=${student.id}`)}
        aria-label={`Agendar avaliação para ${student.name}`}
        title="Agendar avaliação"
      >
        <CalendarPlus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={() => setEditingStudent(student)}
        aria-label={`Editar aluno ${student.name}`}
        title="Editar aluno"
      >
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleDeleteStudent(student.id, student.name)}
        className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
        aria-label={`Excluir aluno ${student.name}`}
        title="Excluir aluno"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

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
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                disabled={overdueStudents.length === 0 || chargingOverdue}
                onClick={handleChargeOverdue}
              >
                <AlertCircle className="h-4 w-4" />
                Cobrar vencidos ({overdueStudents.length})
              </Button>
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

          {filteredStudents.length > 0 ? (
            <>
              {/* Tabela — desktop */}
              <div className="hidden md:block border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      {visibleColumns.phone && <TableHead>WhatsApp</TableHead>}
                      {visibleColumns.cpf && <TableHead>CPF</TableHead>}
                      {visibleColumns.city && <TableHead>Cidade</TableHead>}
                      {visibleColumns.birthday && <TableHead>Aniversário</TableHead>}
                      {visibleColumns.plan && <TableHead>Plano</TableHead>}
                      {visibleColumns.created && <TableHead>Cadastrado em</TableHead>}
                      {visibleColumns.dueDate && <TableHead>Vencimento</TableHead>}
                      {visibleColumns.payment && <TableHead>Pagamento</TableHead>}
                      {visibleColumns.status && <TableHead>Status</TableHead>}
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => {
                      const active = isActive(student);
                      const pendingCount = pendingByStudent[student.id] || 0;
                      const pay = paymentStatus(student.payment_due_date);
                      return (
                        <TableRow key={student.id} className="cursor-pointer" onClick={() => setViewingStudent(student)}>
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
                          {visibleColumns.phone && (
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                {student.phone}
                              </div>
                            </TableCell>
                          )}
                          {visibleColumns.cpf && (
                            <TableCell>
                              {student.cpf ? (
                                <div className="flex items-center gap-2 text-sm font-mono">
                                  <IdCard className="h-4 w-4 text-muted-foreground" />
                                  {maskCpfDisplay(student.cpf)}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.city && (
                            <TableCell>
                              {student.city ? (
                                <div className="flex items-center gap-2 text-sm">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  {student.city}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.birthday && (
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
                          )}
                          {visibleColumns.plan && (
                            <TableCell>
                              {student.plan ? (
                                <Badge variant="outline" className="text-xs">{student.plan}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.created && (
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                {format(new Date(student.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                            </TableCell>
                          )}
                          {visibleColumns.dueDate && (
                            <TableCell>
                              {student.payment_due_date ? (
                                <div className="flex items-center gap-2 text-sm">
                                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                                  {format(new Date(student.payment_due_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.payment && (
                            <TableCell>
                              {pay ? (
                                <Badge variant="outline" className={pay.cls}>{pay.label}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.status && <TableCell>{renderStatusBadge(active)}</TableCell>}
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <ActionButtons student={student} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Cards — mobile */}
              <div className="md:hidden space-y-3">
                {filteredStudents.map((student) => {
                  const active = isActive(student);
                  const pendingCount = pendingByStudent[student.id] || 0;
                  const pay = paymentStatus(student.payment_due_date);
                  return (
                    <div
                      key={student.id}
                      className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-accent/40 transition-colors"
                      onClick={() => setViewingStudent(student)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{student.name}</span>
                            {pendingCount > 0 && (
                              <Badge variant="outline" className="gap-1 text-xs border-amber-500/40 text-amber-600">
                                <Bell className="h-3 w-3" />
                                {pendingCount}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Phone className="h-3.5 w-3.5" />
                            {student.phone}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {pay && <Badge variant="outline" className={pay.cls}>{pay.label}</Badge>}
                        {renderStatusBadge(active)}
                        {student.plan && <Badge variant="outline" className="text-xs">{student.plan}</Badge>}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <ActionButtons student={student} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
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

      <StudentSheet
        student={viewingStudent}
        open={!!viewingStudent}
        onOpenChange={(o) => !o && setViewingStudent(null)}
      />
    </div>
  );
}
