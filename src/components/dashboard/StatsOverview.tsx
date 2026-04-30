import { Card, CardContent } from "@/components/ui/card";
import { Mail, Calendar, Clock, CheckCircle2, MessageSquare, Cake } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardData";

type Stat = {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  gradient: string;
  iconBg: string;
};

function StatCard({ stat }: { stat: Stat }) {
  return (
    <Card className="overflow-hidden relative group hover:shadow-elegant transition-all duration-300 hover:-translate-y-0.5">
      <div className={`absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity ${stat.gradient}`} />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
              {stat.title}
            </p>
            <p className="text-3xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </div>
          <div className={`p-3 rounded-xl shadow-lg shrink-0 ${stat.iconBg}`}>
            <stat.icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsOverview() {
  const { data: stats, isLoading } = useDashboardStats();

  const messageStats: Stat[] = [
    {
      title: "Para Enviar Hoje",
      value: isLoading ? "..." : (stats?.messagesToSendToday ?? 0).toString(),
      icon: Mail,
      description: "Agendadas para hoje",
      gradient: "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600",
      iconBg: "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600",
    },
    {
      title: "Enviadas Hoje",
      value: isLoading ? "..." : (stats?.messagesSentToday ?? 0).toString(),
      icon: CheckCircle2,
      description: "Já entregues no dia",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
    {
      title: "Próximas 24h",
      value: isLoading ? "..." : (stats?.scheduledMessages ?? 0).toString(),
      icon: Clock,
      description: "Programadas em breve",
      gradient: "bg-gradient-to-br from-[hsl(var(--warning))] to-orange-600",
      iconBg: "bg-gradient-to-br from-[hsl(var(--warning))] to-orange-600",
    },
  ];

  const peopleStats: Stat[] = [
    {
      title: "Aniversariantes",
      value: isLoading ? "..." : (stats?.birthdaysToday ?? 0).toString(),
      icon: Cake,
      description: "Fazem aniversário hoje",
      gradient: "bg-gradient-to-br from-purple-500 to-pink-600",
      iconBg: "bg-gradient-to-br from-purple-500 to-pink-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Bloco de Mensagens */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Status das Mensagens
          </h2>
          <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {messageStats.map((s) => (
            <StatCard key={s.title} stat={s} />
          ))}
        </div>
      </section>

      {/* Bloco de Pessoas */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Acontecendo Hoje
          </h2>
          <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {peopleStats.map((s) => (
            <StatCard key={s.title} stat={s} />
          ))}
        </div>
      </section>
    </div>
  );
}
