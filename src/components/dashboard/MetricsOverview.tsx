
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Users, MessageCircle, Clock, Calendar } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardData";

interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: React.ComponentType<any>;
  description: string;
}

function MetricCard({ title, value, change, changeType, icon: Icon, description }: MetricCardProps) {
  const changeColor = {
    positive: "text-green-600 bg-green-100",
    negative: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100"
  }[changeType];

  const TrendIcon = changeType === "positive" ? TrendingUp : TrendingDown;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="flex items-center space-x-2 mt-2">
          <Badge variant="secondary" className={changeColor}>
            <TrendIcon className="h-3 w-3 mr-1" />
            {change}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}

export function MetricsOverview() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-muted rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16 mb-2"></div>
              <div className="h-4 bg-muted rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      title: "Total de Alunos",
      value: stats?.totalStudents?.toString() || "0",
      change: "+12%",
      changeType: "positive" as const,
      icon: Users,
      description: "Comparado ao mês passado"
    },
    {
      title: "Mensagens Para Enviar Hoje",
      value: stats?.messagesToSendToday?.toString() || "0",
      change: "+8%",
      changeType: "positive" as const,
      icon: MessageCircle,
      description: "Mensagens agendadas para hoje"
    },
    {
      title: "Mensagens Agendadas",
      value: stats?.scheduledMessages?.toString() || "0",
      change: "Próximas 24h",
      changeType: "neutral" as const,
      icon: Clock,
      description: "Mensagens pendentes"
    },
    {
      title: "Aniversariantes Hoje",
      value: stats?.birthdaysToday?.toString() || "0",
      change: "Hoje",
      changeType: "neutral" as const,
      icon: Calendar,
      description: "Alunos fazendo aniversário"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}
