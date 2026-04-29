
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Calendar, Clock, User, MessageSquare } from "lucide-react";

interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
  message_type: string;
  created_at: string;
  student_id: string;
  students?: {
    name: string;
    phone: string;
  };
}

interface MessagesListProps {
  messages: ScheduledMessage[];
  searchTerm: string;
  dateFilter: string;
  customDateRange: { from?: Date; to?: Date };
  selectedStudents: string[];
  selectedMessages: string[];
  onMessageSelect: (messageId: string, isSelected: boolean) => void;
  onSelectAll: (isSelected: boolean) => void;
  onDeleteSelected: () => void;
  onEdit: (message: ScheduledMessage) => void;
  onDelete: (messageId: string) => void;
}

const getMessageTypeLabel = (type: string) => {
  switch (type) {
    case '7_day_followup':
      return 'Followup 7 dias';
    case '21_day_followup':
      return 'Followup 21 dias';
    case '45_day_followup':
      return 'Followup 45 dias';
    case 'manual':
      return 'Manual';
    default:
      return type;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pendente</Badge>;
    case 'sent':
      return <Badge variant="default">Enviada</Badge>;
    case 'failed':
      return <Badge variant="destructive">Falhou</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const getFilteredMessagesCount = (
  messages: ScheduledMessage[],
  searchTerm: string,
  dateFilter: string,
  customDateRange: { from?: Date; to?: Date },
  selectedStudents: string[]
) => {
  return messages.filter((message) => {
    const matchesSearch = 
      message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.phone.includes(searchTerm);
    
    const messageDate = new Date(message.scheduled_for);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    let matchesDate = true;
    switch (dateFilter) {
      case 'today':
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);
        matchesDate = messageDate >= startOfToday && messageDate < endOfToday;
        break;
      case 'this-month':
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        matchesDate = messageDate >= startOfMonth && messageDate < endOfMonth;
        break;
      case 'custom':
        if (customDateRange.from && customDateRange.to) {
          const fromDate = new Date(customDateRange.from);
          const toDate = new Date(customDateRange.to);
          toDate.setHours(23, 59, 59, 999);
          matchesDate = messageDate >= fromDate && messageDate <= toDate;
        } else if (customDateRange.from) {
          matchesDate = messageDate >= new Date(customDateRange.from);
        }
        break;
    }
    
    const matchesStudents = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);
    
    return matchesSearch && matchesDate && matchesStudents;
  }).length;
};

export default function MessagesList({
  messages,
  searchTerm,
  dateFilter,
  customDateRange,
  selectedStudents,
  selectedMessages,
  onMessageSelect,
  onSelectAll,
  onDeleteSelected,
  onEdit,
  onDelete
}: MessagesListProps) {
  const [showAllMessages, setShowAllMessages] = useState(false);

  const filteredMessages = messages.filter((message) => {
    const matchesSearch = 
      message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.phone.includes(searchTerm);
    
    const messageDate = new Date(message.scheduled_for);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    let matchesDate = true;
    switch (dateFilter) {
      case 'today':
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);
        matchesDate = messageDate >= startOfToday && messageDate < endOfToday;
        break;
      case 'this-month':
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        matchesDate = messageDate >= startOfMonth && messageDate < endOfMonth;
        break;
      case 'custom':
        if (customDateRange.from && customDateRange.to) {
          const fromDate = new Date(customDateRange.from);
          const toDate = new Date(customDateRange.to);
          toDate.setHours(23, 59, 59, 999);
          matchesDate = messageDate >= fromDate && messageDate <= toDate;
        } else if (customDateRange.from) {
          matchesDate = messageDate >= new Date(customDateRange.from);
        }
        break;
    }
    
    const matchesStudents = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);
    
    return matchesSearch && matchesDate && matchesStudents;
  });

  const displayMessages = showAllMessages ? filteredMessages : filteredMessages.slice(0, 5);
  const allSelected = filteredMessages.length > 0 && filteredMessages.every(msg => selectedMessages.includes(msg.id));
  const someSelected = filteredMessages.some(msg => selectedMessages.includes(msg.id));

  const handleRowClick = (messageId: string, event: React.MouseEvent) => {
    // Don't trigger row selection if clicking on action buttons
    if ((event.target as HTMLElement).closest('.action-buttons')) {
      return;
    }
    
    const isSelected = selectedMessages.includes(messageId);
    onMessageSelect(messageId, !isSelected);
  };

  if (filteredMessages.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          Nenhuma mensagem encontrada com os filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with bulk actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => onSelectAll(checked as boolean)}
              className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
            />
            <span className="text-sm text-muted-foreground">
              {selectedMessages.length > 0 ? `${selectedMessages.length} selecionada(s)` : "Selecionar todas"}
            </span>
          </div>
          
          {selectedMessages.length > 0 && (
            <Button
              onClick={onDeleteSelected}
              variant="destructive"
              size="sm"
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Excluir Selecionadas
            </Button>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div className="space-y-3">
        {displayMessages.map((message) => (
          <div
            key={message.id}
            className={`p-4 border rounded-lg transition-colors cursor-pointer hover:bg-muted/50 ${
              selectedMessages.includes(message.id) ? 'bg-muted/30 border-primary/50' : 'hover:border-muted-foreground/20'
            }`}
            onClick={(e) => handleRowClick(message.id, e)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Checkbox
                  checked={selectedMessages.includes(message.id)}
                  onChange={() => {}} // Controlled by row click
                  className="mt-1 pointer-events-none"
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="font-medium">{message.students?.name}</span>
                      <span>({message.students?.phone})</span>
                    </div>
                    {getStatusBadge(message.status)}
                    <Badge variant="outline" className="text-xs">
                      {getMessageTypeLabel(message.message_type)}
                    </Badge>
                  </div>
                  
                  <p className="text-sm mb-3 break-words">{message.content}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {format(new Date(message.scheduled_for), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {format(new Date(message.scheduled_for), "HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="action-buttons flex items-center gap-2 shrink-0">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(message);
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(message.id);
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Show more button */}
      {!showAllMessages && filteredMessages.length > 5 && (
        <div className="text-center">
          <Button
            onClick={() => setShowAllMessages(true)}
            variant="outline"
            className="gap-2"
          >
            Ver todas ({filteredMessages.length - 5} restantes)
          </Button>
        </div>
      )}
      
      {showAllMessages && filteredMessages.length > 5 && (
        <div className="text-center">
          <Button
            onClick={() => setShowAllMessages(false)}
            variant="outline"
            className="gap-2"
          >
            Ver menos
          </Button>
        </div>
      )}
    </div>
  );
}
