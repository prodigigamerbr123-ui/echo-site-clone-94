
import { MessageCircle, Calendar, User, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  content: string;
  status: string;
  sent_at: string;
  student_id: string;
  students?: {
    name: string;
    phone: string;
  };
}

interface MessagesListProps {
  messages: Message[];
  searchTerm: string;
  dateFilter: string;
  customDateRange: { from?: Date; to?: Date };
  selectedStudents?: string[];
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'sent':
      return <Badge variant="default" className="bg-green-500">Enviado</Badge>;
    case 'failed':
      return <Badge variant="destructive">Falhou</Badge>;
    case 'pending':
      return <Badge variant="secondary">Pendente</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const filterMessagesByDate = (messages: Message[], dateFilter: string, customDateRange: { from?: Date; to?: Date }) => {
  if (dateFilter === "all") return messages;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  return messages.filter((message) => {
    const messageDate = new Date(message.sent_at);
    
    if (dateFilter === "today") {
      return messageDate >= today;
    } else if (dateFilter === "this-month") {
      return messageDate >= thisMonth;
    } else if (dateFilter === "custom" && customDateRange.from) {
      const fromDate = new Date(customDateRange.from.getFullYear(), customDateRange.from.getMonth(), customDateRange.from.getDate());
      const toDate = customDateRange.to 
        ? new Date(customDateRange.to.getFullYear(), customDateRange.to.getMonth(), customDateRange.to.getDate(), 23, 59, 59)
        : new Date(customDateRange.from.getFullYear(), customDateRange.from.getMonth(), customDateRange.from.getDate(), 23, 59, 59);
      
      return messageDate >= fromDate && messageDate <= toDate;
    }
    
    return true;
  });
};

export const getFilteredMessagesCount = (messages: Message[], searchTerm: string, dateFilter: string, customDateRange: { from?: Date; to?: Date }, selectedStudents: string[] = []) => {
  const filteredBySearch = messages.filter((message) => {
    const matchesSearch = 
      message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.phone.includes(searchTerm);
    
    const matchesStudentFilter = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);
    
    return matchesSearch && matchesStudentFilter;
  });

  return filterMessagesByDate(filteredBySearch, dateFilter, customDateRange).length;
};

export default function MessagesList({ messages, searchTerm, dateFilter, customDateRange, selectedStudents = [] }: MessagesListProps) {
  const filteredMessages = messages.filter((message) => {
    const matchesSearch = 
      message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.phone.includes(searchTerm);
    
    const matchesStudentFilter = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);
    
    return matchesSearch && matchesStudentFilter;
  });

  const dateFilteredMessages = filterMessagesByDate(filteredMessages, dateFilter, customDateRange);

  if (dateFilteredMessages.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          {searchTerm || dateFilter !== "all" || selectedStudents.length > 0
            ? "Nenhuma mensagem encontrada com os filtros aplicados." 
            : "Nenhuma mensagem encontrada."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dateFilteredMessages.map((message) => (
        <div
          key={message.id}
          className="p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {message.students?.name || 'Aluno não encontrado'}
                </span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span className="text-sm">{message.students?.phone}</span>
                </div>
              </div>
              
              <p className="text-foreground bg-muted/50 p-3 rounded-md">
                {message.content}
              </p>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {formatDate(message.sent_at)}
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
              {getStatusBadge(message.status)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
