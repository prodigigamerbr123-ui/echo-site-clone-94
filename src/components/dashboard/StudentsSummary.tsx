
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Users, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function StudentsSummary() {
  const { data: studentsData, isLoading } = useQuery({
    queryKey: ['students-summary'],
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      // Get recent students (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentStudents } = await supabase
        .from('students')
        .select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      // Get students without evaluation
      const { data: studentsWithoutEvaluation } = await supabase
        .from('students')
        .select('*')
        .eq('had_evaluation', false)
        .order('created_at', { ascending: false })
        .limit(5);

      // Get upcoming scheduled messages
      const { data: upcomingMessages } = await supabase
        .from('scheduled_messages')
        .select(`
          *,
          students (name, phone)
        `)
        .eq('status', 'pending')
        .gte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(5);

      return {
        recentStudents: recentStudents || [],
        studentsWithoutEvaluation: studentsWithoutEvaluation || [],
        upcomingMessages: upcomingMessages || []
      };
    }
  });

  const getMessageTypeBadge = (messageType: string) => {
    switch (messageType) {
      case 'daqui_7_dias':
        return <Badge className="bg-success text-success-foreground">Daqui 7 dias</Badge>;
      case 'daqui_21_dias':
        return <Badge className="bg-warning text-warning-foreground">Daqui 21 dias</Badge>;
      case 'daqui_45_dias':
        return <Badge className="bg-primary text-primary-foreground">Daqui 45 dias</Badge>;
      case 'avaliacao_fisica':
        return <Badge variant="destructive">Avaliação Física</Badge>;
      default:
        return <Badge variant="secondary">{messageType}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
      {/* Alunos Recentes */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Alunos Recentes
          </CardTitle>
          <CardDescription>
            Cadastrados nos últimos 7 dias
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studentsData?.recentStudents.length ? (
            <div className="space-y-3">
              {studentsData.recentStudents.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(student.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant={student.had_evaluation ? "default" : "secondary"} className="text-xs">
                    {student.had_evaluation ? "Avaliado" : "Pendente"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum aluno cadastrado recentemente
            </p>
          )}
        </CardContent>
      </Card>

      {/* Alunos Sem Avaliação */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Sem Avaliação
          </CardTitle>
          <CardDescription>
            Alunos que precisam fazer avaliação física
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studentsData?.studentsWithoutEvaluation.length ? (
            <div className="space-y-3">
              {studentsData.studentsWithoutEvaluation.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Cadastrado em {format(new Date(student.created_at), "dd/MM", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-xs">
                    Pendente
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todos os alunos fizeram avaliação! 🎉
            </p>
          )}
        </CardContent>
      </Card>

      {/* Mensagens Agendadas */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-warning" />
            Próximas Mensagens
          </CardTitle>
          <CardDescription>
            Mensagens agendadas para envio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studentsData?.upcomingMessages.length ? (
            <div className="space-y-3">
              {studentsData.upcomingMessages.map((message) => (
                <div key={message.id} className="p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">{message.students?.name}</p>
                    {getMessageTypeBadge(message.message_type)}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(message.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma mensagem agendada
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
