import { Button } from "@/components/ui/button";
import { CalendarPlus, Edit, Send, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Student } from "./studentListModel";

interface Props {
  student: Student;
  canManageStudents: boolean;
  canDeleteStudents: boolean;
  deletingId: string | null;
  onEdit: (student: Student) => void;
  onDelete: (id: string, name: string) => Promise<void>;
}

export function StudentListActions({ student, canManageStudents, canDeleteStudents, deletingId, onEdit, onDelete }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex justify-end gap-1">
      {canManageStudents && <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={() => navigate(`/mensagens?aluno=${student.id}`)}
        aria-label={`Enviar mensagem para ${student.name}`}
        title="Enviar mensagem"
      >
        <Send className="h-4 w-4" />
      </Button>}
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
      {canManageStudents && <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={() => onEdit(student)}
        aria-label={`Editar aluno ${student.name}`}
        title="Editar aluno"
      >
        <Edit className="h-4 w-4" />
      </Button>}
      {canDeleteStudents && <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(student.id, student.name)}
        disabled={deletingId === student.id}
        className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
        aria-label={`Excluir aluno ${student.name}`}
        title="Excluir aluno"
      >
        <Trash2 className="h-4 w-4" />
      </Button>}
    </div>
  );
}
