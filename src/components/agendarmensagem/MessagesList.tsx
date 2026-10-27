import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AUTO_EVAL_MESSAGE_TYPES } from "@/lib/evaluationMessages";
import { fmtDateISOSP, fmtTimeSP } from "@/lib/spTime";
import { hasUncertainDelivery } from "@/lib/messageDeliveryState";
import { MessageConversationLink } from "@/components/mensagens/MessageConversationLink";
import { AlertCircle, Bot, Calendar, Clock, Edit2, Hand, MessageSquare, RotateCcw, Trash2, User } from "lucide-react";
import { useState } from "react";
import { filterScheduledMessages, type ScheduledMessage } from "./scheduledMessageFilters";

interface Props {
  readOnly?: boolean;
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
  onCancelSeries?: (id: string) => void;
}

const AUTO_TYPES = new Set<string>([
  ...AUTO_EVAL_MESSAGE_TYPES,
  "evaluation_reminder",
  "birthday",
  "evaluation_followup",
  "evaluation_reschedule",
  "welcome",
  "reengagement",
  "payment_reminder_before",
  "payment_reminder_due",
  "payment_overdue",
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
    "welcome": "Boas-vindas",
    "reengagement": "Reengajamento",
    "payment_reminder_before": "Aviso de vencimento",
    "payment_reminder_due": "Vencimento hoje",
    "payment_overdue": "Mensalidade vencida",
  };
  return labels[type] || type;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "pending": return <Badge variant="secondary">Pendente</Badge>;
    case "sent": return <Badge>Enviada</Badge>;
    case "failed": return <Badge variant="destructive">Falhou</Badge>;
    case "cancelled": return <Badge variant="outline">Cancelada</Badge>;
    case "processing": return <Badge variant="outline">Enviando...</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

export default function MessagesList({
  readOnly = false, messages, searchTerm, dateFilter, customDateRange, selectedStudents,
  selectedMessages, onMessageSelect, onSelectAll, onDeleteSelected, onEdit, onDelete, onRetry, onCancelSeries,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const filtered = filterScheduledMessages(messages, searchTerm, dateFilter, customDateRange, selectedStudents);
  const display = showAll ? filtered : filtered.slice(0, 10);
  const selectable = filtered.filter(m => !hasUncertainDelivery(m) && !m.dispatch_started_at && ["pending", "failed", "processing"].includes(m.status));
  const allSel = selectable.length > 0 && selectable.every(m => selectedMessages.includes(m.id));

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
      {!readOnly && <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox disabled={selectable.length === 0} checked={allSel} onCheckedChange={(c) => onSelectAll(!!c)} />
          <span className="text-sm text-muted-foreground">
            {selectedMessages.length > 0 ? `${selectedMessages.length} selecionada(s)` : "Selecionar todas"}
          </span>
          {selectedMessages.length > 0 && (
            <Button onClick={onDeleteSelected} variant="destructive" size="sm">
              <Trash2 className="h-3 w-3 mr-1" /> Cancelar selecionadas
            </Button>
          )}
        </div>
      </div>}

      <div className="space-y-2">
        {display.map((m) => {
          const uncertain = hasUncertainDelivery(m);
          const auto = isAutoType(m.message_type);
          return (
            <div
              key={m.id}
              className={`p-3 border rounded-lg hover:bg-muted/40 transition-colors ${
                selectedMessages.includes(m.id) ? "bg-muted/30 border-primary/50" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {!readOnly && <Checkbox
                  disabled={uncertain || !!m.dispatch_started_at || !["pending", "failed", "processing"].includes(m.status)}
                  checked={selectedMessages.includes(m.id)}
                  onCheckedChange={(c) => onMessageSelect(m.id, !!c)}
                  className="mt-1"
                />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium text-sm">{m.students?.name}</span>
                    <span className="text-xs text-muted-foreground">{m.students?.phone}</span>
                    {uncertain ? <Badge variant="outline">Entrega a conferir</Badge> : getStatusBadge(m.status)}
                    <Badge variant="outline" className="text-xs gap-1">
                      {auto ? <Bot className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                      {auto ? "Automática" : "Manual"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{getMessageTypeLabel(m.message_type)}</Badge>
                  </div>
                  <p className="text-sm mb-2 break-words">{m.content}</p>
                  <div className="flex items-center gap-3 text-xs text-foreground/80">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden="true" />{Number.isFinite(Date.parse(m.scheduled_for)) ? fmtDateISOSP(new Date(m.scheduled_for)).split("-").reverse().join("/") : "Data indisponível"}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{Number.isFinite(Date.parse(m.scheduled_for)) ? fmtTimeSP(new Date(m.scheduled_for)) + " · Brasília" : ""}</span>
                  </div>
                  {uncertain && <div className="mt-2 rounded border border-amber-500/50 p-3 text-sm space-y-1"><p className="font-medium">Resultado incerto. Confira no WhatsApp antes de repetir.</p>{m.failure_reason && <p>{m.failure_reason}</p>}<p>Este registro não confirma falha nem entrega. O histórico do envio será preservado.</p><MessageConversationLink phone={m.students?.phone} /></div>}
                  {m.status === "failed" && !uncertain && (
                    <div className="mt-2 flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/30 rounded p-2">
                      <AlertCircle className="h-3 w-3 text-destructive mt-0.5" />
                      <div className="flex-1">
                        <p className="text-destructive font-medium">
                          Falhou{m.retry_count ? ` ${m.retry_count}x` : ""}{m.failure_reason ? `: ${m.failure_reason}` : ""}
                        </p>
                      </div>
                      {onRetry && !readOnly && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => onRetry(m.id)}
                          aria-label={m.dispatch_started_at ? "Revisar entrega incerta" : "Reenviar mensagem"}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> {m.dispatch_started_at ? "Revisar entrega" : "Tentar de novo"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {!readOnly && !uncertain && <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    disabled={m.status !== "pending" && m.status !== "failed" || !!m.dispatch_started_at || !!m.evaluation_id}
                    onClick={() => onEdit(m)}
                    aria-label="Editar mensagem agendada"
                    title="Editar mensagem agendada"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  {m.recurrence_parent_id && onCancelSeries && m.status !== "sent" && m.status !== "cancelled" && (
                    <Button variant="outline" size="sm" onClick={() => onCancelSeries(m.id)}>Cancelar série</Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive"
                    disabled={m.status === "cancelled" || !!m.dispatch_started_at}
                    onClick={() => onDelete(m.id)}
                    aria-label="Cancelar mensagem agendada"
                    title="Cancelar mensagem agendada"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>}
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
