import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { maskCpf } from "@/lib/cpf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, Bell, Cake, Calendar, CalendarClock, IdCard, MapPin, Phone } from "lucide-react";
import type { ColumnKey } from "./listaAlunosColumns";
import { StudentListActions } from "./StudentListActions";
import { paymentStatus, type Student } from "./studentListModel";

interface Props {
  filteredStudents: Student[];
  visibleColumns: Record<ColumnKey, boolean>;
  pendingByStudent: Record<string, number>;
  canManageStudents: boolean;
  canDeleteStudents: boolean;
  deletingId: string | null;
  setViewingStudent: (student: Student) => void;
  setEditingStudent: (student: Student) => void;
  handleDeleteStudent: (id: string, name: string) => Promise<void>;
}

function renderStatusBadge(active: boolean) {
  return active ? (
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
}

export function StudentListResults({
  filteredStudents, visibleColumns, pendingByStudent,
  canManageStudents, canDeleteStudents, deletingId,
  setViewingStudent, setEditingStudent, handleDeleteStudent,
}: Props) {
  const isActive = (student: Student) => student.status === "active";
  return (
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
              {visibleColumns.payment && <TableHead>Situação do prazo</TableHead>}
              {visibleColumns.lastEval && <TableHead>Última avaliação</TableHead>}
              {visibleColumns.status && <TableHead>Status</TableHead>}
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student) => {
              const active = isActive(student);
              const pendingCount = pendingByStudent[student.id] || 0;
              const pay = active ? paymentStatus(student.payment_due_date) : null;
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
                        <div className="flex items-center gap-2 text-sm">
                          <IdCard className="h-4 w-4 text-muted-foreground" />
                          {maskCpf(student.cpf)}
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
                          {format(new Date(student.birth_date + "T12:00:00"), "dd/MM", { locale: ptBR })}
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
                  {visibleColumns.lastEval && (
                    <TableCell>
                      {student.last_evaluation_date ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(student.last_evaluation_date), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  {visibleColumns.status && <TableCell>{renderStatusBadge(active)}</TableCell>}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <StudentListActions
                      student={student}
                      canManageStudents={canManageStudents}
                      canDeleteStudents={canDeleteStudents}
                      deletingId={deletingId}
                      onEdit={setEditingStudent}
                      onDelete={handleDeleteStudent}
                    />
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
          const pay = active ? paymentStatus(student.payment_due_date) : null;
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
                <StudentListActions
                  student={student}
                  canManageStudents={canManageStudents}
                  canDeleteStudents={canDeleteStudents}
                  deletingId={deletingId}
                  onEdit={setEditingStudent}
                  onDelete={handleDeleteStudent}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
