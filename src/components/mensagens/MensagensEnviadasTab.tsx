import { fetchAllPages } from "@/lib/fetchAllPages";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Filter, MessageCircle } from "lucide-react";
import { useState } from "react";
import MessageFilters from "./MessageFilters";
import MessagesList from "./MessagesList";
import { getFilteredMessagesCount, type Message } from "./sentMessageFilters";

interface Student {
  id: string;
  name: string;
  phone: string;
}

export default function MensagensEnviadasTab() {
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("today");
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const catalog = useQuery({
    queryKey: ["sent-messages", "catalog"],
    queryFn: async () => {
      const [messages, students] = await Promise.all([
        fetchAllPages<Message>((from, to) => supabase.from("messages")
          .select("*, students(name, phone)", { count: "exact" })
          .order("sent_at", { ascending: false }).order("id").range(from, to)),
        fetchAllPages<Student>((from, to) => supabase.from("students")
          .select("id, name, phone", { count: "exact" })
          .order("name").order("id").range(from, to)),
      ]);
      return { messages, students };
    },
  });
  const messages = catalog.data?.messages ?? [];
  const students = catalog.data?.students ?? [];

  const sentMessages = messages.filter(m => m.status === 'sent');
  const failedMessages = messages.filter(m => m.status === 'failed');

  // Contadores filtrados para cada aba
  const sentCount = getFilteredMessagesCount(sentMessages, searchTerm, dateFilter, customDateRange, selectedStudents);
  const failedCount = getFilteredMessagesCount(failedMessages, searchTerm, dateFilter, customDateRange, selectedStudents);

  if (catalog.error) {
    return <div role="alert" className="space-y-3">
      <p>Não foi possível carregar o histórico completo e os filtros de alunos.</p>
      <Button onClick={() => void catalog.refetch()}>Tentar novamente</Button>
    </div>;
  }

  if (catalog.isPending) {
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
