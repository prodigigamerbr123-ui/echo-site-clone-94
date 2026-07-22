
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Users, MessageCircle, Clock, Calendar } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardData";

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  description: string;
  color: string;
  isLoading?: boolean;
}

function StatCard({ title, value, icon: Icon, description, color, isLoading }: StatCardProps) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-lg ${color} text-white`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground flex items-center gap-2">
          {value}
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <p className="text-xs text-muted-foreground flex items-center mt-1">
          <TrendingUp className="h-3 w-3 mr-1" />
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  const statsData = [
    {
      title: "Total de Alunos",
      value: statsLoading ? "..." : stats?.totalStudents.toString() || "0",
      icon: Users,
      description: "Alunos cadastrados",
      color: "bg-blue-500"
    },
    {
      title: "Mensagens Para Enviar Hoje",
      value: statsLoading ? "..." : stats?.messagesToSendToday.toString() || "0",
      icon: MessageCircle,
      description: "Agendadas para hoje",
      color: "bg-green-500"
    },
    {
      title: "Mensagens Agendadas",
      value: statsLoading ? "..." : stats?.scheduledMessages.toString() || "0",
      icon: Clock,
      description: "Próximas 24h",
      color: "bg-warning"
    },
    {
      title: "Aniversariantes",
      value: statsLoading ? "..." : stats?.birthdaysToday.toString() || "0",
      icon: Calendar,
      description: "Hoje",
      color: "bg-primary"
    }
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {statsData.map((stat) => (
        <StatCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          description={stat.description}
          color={stat.color}
          isLoading={statsLoading}
        />
      ))}
    </div>
  );
}
