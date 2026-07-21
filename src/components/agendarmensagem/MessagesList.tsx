import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Calendar, Clock, User, MessageSquare, Bot, Hand, RotateCcw, AlertCircle } from "lucide-react";
import { AUTO_EVAL_MESSAGE_TYPES } from "@/lib/evaluationMessages";
import { spDate, spParts } from "@/lib/spTime";

interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
  message_type: string;
  created_at: string;
  student_id: string;
  failure_reason?: string | null;
  retry_count?: number | null;
  evaluation_id?: string | null;
  students?: { name: string; phone: string; };
}

interface Props {
  messages: ScheduledMessage[];
  searchTerm: string;
  dateFilter: string;
  customDateRange: { from?: Date; to?: Date };
  selectedStudents: string[];
  selectedMessages: string[];
  onMessageSelect: (id: string, isSel: boolean) => void;
  onSelectAll: (sel: boolean) => void;
  onDeleteSelected: () => void;
  onEdit: (m: ScheduledMessage) => void;
  onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
}

const AUTO_TYPES = new Set<string>([
  ...AUTO_EVAL_MESSAGE_TYPES,
  "evaluation_reminder",
  "birthday",
  "evaluation_followup",
  "evaluation_reschedule",
]);

const isAutoType = (t: string) => AUTO_TYPES.has(t);

const getMessageTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    "7_day_followup": "Followup 7d",
    "21_day_followup": "Followup 21d",
    "45_day_followup": "Followup 45d",
    "manual": "Manual",
    "recurring": "Recorrente",
    "evaluation_confirmation": "Confirmação avaliação",
    "evaluation_reminder_1d": "Lembrete véspera",
    "evaluation_reminder_day": "Lembrete no dia",
    "evaluation_followup": "Follow-up avaliação",
    "evaluation_reschedule": "Remarcar avaliação",
    "evaluation_reminder": "Avaliação vencida",
    "birthday": "Aniversário",
  };
  return labels[type] || type;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "pending": return <Badge variant="secondary">Pendente</Badge>;
    case "sent": return <Badge>Enviada</Badge>;
    case "failed": return <Badge variant="destructive">Falhou</Badge>;
    case "processing": return <Badge variant="outline">Enviando...</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

function applyFilters(
  messages: ScheduledMessage[],
  searchTerm: string,
  dateFilter: string,
  customDateRange: { from?: Date; to?: Date },
  selectedStudents: string[],
) {
  return messages.filter((m) => {
    const matchS = m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.students?.phone.includes(searchTerm);
    const md = new Date(m.scheduled_for);
    const nowSP = spParts(new Date());
    const startToday = spDate(nowSP.y, nowSP.mo, nowSP.d, 0, 0);
    const startMonth = spDate(nowSP.y, nowSP.mo, 1, 0, 0);
    let matchD = true;
    if (dateFilter === "today") {
      const end = spDate(nowSP.y, nowSP.mo, nowSP.d + 1, 0, 0);
      matchD = md >= startToday && md < end;
    } else if (dateFilter === "this-month") {
      const end = spDate(nowSP.y, nowSP.mo + 1, 1, 0, 0);
      matchD = md >= startMonth && md < end;
    } else if (dateFilter === "custom") {
      if (customDateRange.from && customDateRange.to) {
        const to = new Date(customDateRange.to); to.setHours(23, 59, 59, 999);
        matchD = md >= new Date(customDateRange.from) && md <= to;
      } else if (customDateRange.from) {
        matchD = md >= new Date(customDateRange.from);
      }
    }
    const matchU = selectedStudents.length === 0 || selectedStudents.includes(m.student_id);
    return matchS && matchD && matchU;
  });
}

export const getFilteredMessagesCount = (
  messages: ScheduledMessage[], searchTerm: string, dateFilter: string,
  customDateRange: { from?: Date; to?: Date }, selectedStudents: string[],
) => applyFilters(messages, searchTerm, dateFilter, customDateRange, selectedStudents).length;

export default function MessagesList({
  messages, searchTerm, dateFilter, customDateRange, selectedStudents,
  selectedMessages, onMessageSelect, onSelectAll, onDeleteSelected, onEdit, onDelete, onRetry,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const filtered = applyFilters(messages, searchTerm, dateFilter, customDateRange, selectedStudents);
  const display = showAll ? filtered : filtered.slice(0, 10);
  const allSel = filtered.length > 0 && filtered.every(m => selectedMessages.includes(m.id));

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Nenhuma mensagem com os filtros aplicados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox checked={allSel} onCheckedChange={(c) => onSelectAll(!!c)} />
          <span className="text-sm text-muted-foreground">
            {selectedMessages.length > 0 ? `${selectedMessages.length} selecionada(s)` : "Selecionar todas"}
          </span>
          {selectedMessages.length > 0 && (
            <Button onClick={onDeleteSelected} variant="destructive" size="sm">
              <Trash2 className="h-3 w-3 mr-1" /> Excluir selecionadas
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {display.map((m) => {
          const auto = isAutoType(m.message_type);
          return (
            <div
              key={m.id}
              className={`p-3 border rounded-lg hover:bg-muted/40 transition-colors ${
                selectedMessages.includes(m.id) ? "bg-muted/30 border-primary/50" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedMessages.includes(m.id)}
                  onCheckedChange={(c) => onMessageSelect(m.id, !!c)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium text-sm">{m.students?.name}</span>
                    <span className="text-xs text-muted-foreground">{m.students?.phone}</span>
                    {getStatusBadge(m.status)}
                    <Badge variant="outline" className="text-xs gap-1">
                      {auto ? <Bot className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                      {auto ? "Automática" : "Manual"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{getMessageTypeLabel(m.message_type)}</Badge>
                  </div>
                  <p className="text-sm mb-2 break-words">{m.content}</p>
                  <div className="flex items-center gap-3 text-xs text-foreground/80">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden="true" />{format(new Date(m.scheduled_for), "dd/MM/yyyy", { locale: ptBR })}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{format(new Date(m.scheduled_for), "HH:mm")}</span>
                  </div>
                  {m.status === "failed" && (
                    <div className="mt-2 flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/30 rounded p-2">
                      <AlertCircle className="h-3 w-3 text-destructive mt-0.5" />
                      <div className="flex-1">
                        <p className="text-destructive font-medium">
                          Falhou{m.retry_count ? ` ${m.retry_count}x` : ""}{m.failure_reason ? `: ${m.failure_reason}` : ""}
                        </p>
                      </div>
                      {onRetry && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => onRetry(m.id)}
                          aria-label="Reenviar mensagem"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Tentar de novo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => onEdit(m)}
                    aria-label="Editar mensagem agendada"
                    title="Editar mensagem agendada"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive"
                    onClick={() => onDelete(m.id)}
                    aria-label="Excluir mensagem agendada"
                    title="Excluir mensagem agendada"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 10 && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Ver menos" : `Ver todas (${filtered.length - 10} restantes)`}
          </Button>
        </div>
      )}
    </div>
  );
}
