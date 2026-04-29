
import { useState, useEffect } from "react";
import { MessageCircle, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import MessageFilters from "./MessageFilters";
import MessagesList, { getFilteredMessagesCount } from "./MessagesList";

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

interface Student {
  id: string;
  name: string;
  phone: string;
}

export default function MensagensEnviadasTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("today");
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMessages();
    fetchStudents();
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          students (
            name,
            phone
          )
        `)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens enviadas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, phone')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a lista de alunos.",
        variant: "destructive",
      });
    }
  };

  const sentMessages = messages.filter(m => m.status === 'sent');
  const failedMessages = messages.filter(m => m.status === 'failed');

  // Contadores filtrados para cada aba
  const sentCount = getFilteredMessagesCount(sentMessages, searchTerm, dateFilter, customDateRange, selectedStudents);
  const failedCount = getFilteredMessagesCount(failedMessages, searchTerm, dateFilter, customDateRange, selectedStudents);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando mensagens...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sent" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sent" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Enviadas ({sentCount})
          </TabsTrigger>
          <TabsTrigger value="failed" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Falharam ({failedCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros - Mensagens Enviadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MessageFilters
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                customDateRange={customDateRange}
                setCustomDateRange={setCustomDateRange}
                students={students}
                selectedStudents={selectedStudents}
                setSelectedStudents={setSelectedStudents}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mensagens Enviadas</CardTitle>
            </CardHeader>
            <CardContent>
              <MessagesList
                messages={sentMessages}
                searchTerm={searchTerm}
                dateFilter={dateFilter}
                customDateRange={customDateRange}
                selectedStudents={selectedStudents}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros - Mensagens Falharam
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MessageFilters
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                customDateRange={customDateRange}
                setCustomDateRange={setCustomDateRange}
                students={students}
                selectedStudents={selectedStudents}
                setSelectedStudents={setSelectedStudents}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mensagens que Falharam</CardTitle>
            </CardHeader>
            <CardContent>
              <MessagesList
                messages={failedMessages}
                searchTerm={searchTerm}
                dateFilter={dateFilter}
                customDateRange={customDateRange}
                selectedStudents={selectedStudents}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
