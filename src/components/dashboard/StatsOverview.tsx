import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Calendar, Clock, CheckCircle2 } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardData";

export function StatsOverview() {
  const { data: stats, isLoading } = useDashboardStats();

  const statsData = [
    {
      title: "Mensagens Para Enviar Hoje",
      value: isLoading ? "..." : (stats?.messagesToSendToday ?? 0).toString(),
      icon: MessageCircle,
      description: "Mensagens agendadas para hoje",
      color: "bg-green-500"
    },
    {
      title: "Mensagens Enviadas Hoje",
      value: isLoading ? "..." : (stats?.messagesSentToday ?? 0).toString(),
      icon: CheckCircle2,
      description: "Já enviadas no dia",
      color: "bg-emerald-500"
    },
    {
      title: "Mensagens Agendadas",
      value: isLoading ? "..." : (stats?.scheduledMessages ?? 0).toString(),
      icon: Clock,
      description: "Próximas 24 horas",
      color: "bg-orange-500"
    },
    {
      title: "Aniversariantes Hoje",
      value: isLoading ? "..." : (stats?.birthdaysToday ?? 0).toString(),
      icon: Calendar,
      description: "Fazem aniversário hoje",
      color: "bg-purple-500"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statsData.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <div className={`p-2 rounded-lg ${stat.color}`}>
              <stat.icon className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
