import { Card, CardContent } from "@/components/ui/card";
import {
  Mail,
  Calendar,
  CalendarRange,
  Clock,
  CheckCircle2,
  MessageSquare,
  Cake,
  Users,
  UserPlus,
  ClipboardList,
  ClipboardCheck,
  AlertTriangle,
  Activity,
  DollarSign,
  CalendarClock,
} from "lucide-react";
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
  const v = (n?: number) => (isLoading ? "..." : (n ?? 0).toString());

  const studentStats: Stat[] = [
    {
      title: "Total de Alunos",
      value: v(stats?.totalStudents),
      icon: Users,
      description: "Cadastrados na base",
      gradient: "bg-gradient-to-br from-primary to-primary-glow",
      iconBg: "bg-gradient-to-br from-primary to-primary-glow",
    },
    {
      title: "Alunos Ativos",
      value: v(stats?.activeStudents),
      icon: Activity,
      description: "Com status ativo",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
    {
      title: "Alunos Inativos",
      value: v(stats?.inactiveStudents),
      icon: Users,
      description: "Sem status ativo",
      gradient: "bg-gradient-to-br from-slate-500 to-slate-700",
      iconBg: "bg-gradient-to-br from-slate-500 to-slate-700",
    },
    {
      title: "Novos no Mês",
      value: v(stats?.newStudentsMonth),
      icon: UserPlus,
      description: "Cadastrados este mês",
      gradient: "bg-gradient-to-br from-sky-500 to-blue-600",
      iconBg: "bg-gradient-to-br from-sky-500 to-blue-600",
    },
  ];

  const messageStats: Stat[] = [
    {
      title: "Próximas 24h",
      value: v(stats?.scheduledMessages),
      icon: Clock,
      description: "Programadas em breve",
      gradient: "bg-gradient-to-br from-[hsl(var(--warning))] to-orange-600",
      iconBg: "bg-gradient-to-br from-[hsl(var(--warning))] to-orange-600",
    },
  ];

  const evaluationStats: Stat[] = [
    {
      title: "Nesta Semana",
      value: v(stats?.evaluationsWeek),
      icon: Calendar,
      description: "Programadas na semana",
      gradient: "bg-gradient-to-br from-blue-500 to-indigo-600",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    },
    {
      title: "Nesse Mês",
      value: v(stats?.evaluationsMonth),
      icon: CalendarRange,
      description: "Programadas no mês",
      gradient: "bg-gradient-to-br from-cyan-500 to-blue-600",
      iconBg: "bg-gradient-to-br from-cyan-500 to-blue-600",
    },
    {
      title: "Atrasadas",
      value: v(stats?.evaluationsOverdue),
      icon: AlertTriangle,
      description: "Vencidas sem conclusão",
      gradient: "bg-gradient-to-br from-red-500 to-rose-600",
      iconBg: "bg-gradient-to-br from-red-500 to-rose-600",
    },
    {
      title: "Concluídas no Mês",
      value: v(stats?.evaluationsCompletedMonth),
      icon: ClipboardCheck,
      description: "Finalizadas este mês",
      gradient: "bg-gradient-to-br from-emerald-500 to-green-600",
      iconBg: "bg-gradient-to-br from-emerald-500 to-green-600",
    },
    {
      title: "Sem Avaliação",
      value: v(stats?.studentsWithoutEvaluation),
      icon: Users,
      description: "Alunos nunca avaliados",
      gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-600",
    },
  ];

  const peopleStats: Stat[] = [
    {
      title: "Para Enviar Hoje",
      value: v(stats?.messagesToSendToday),
      icon: Mail,
      description: "Agendadas para hoje",
      gradient: "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600",
      iconBg: "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600",
    },
    {
      title: "Enviadas Hoje",
      value: v(stats?.messagesSentToday),
      icon: CheckCircle2,
      description: "Já entregues no dia",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
    {
      title: "Avaliações Hoje",
      value: v(stats?.evaluationsToday),
      icon: ClipboardList,
      description: "Agendadas para hoje",
      gradient: "bg-gradient-to-br from-indigo-500 to-violet-600",
      iconBg: "bg-gradient-to-br from-indigo-500 to-violet-600",
    },
    {
      title: "Aniversariantes",
      value: v(stats?.birthdaysToday),
      icon: Cake,
      description: "Fazem aniversário hoje",
      gradient: "bg-gradient-to-br from-purple-500 to-pink-600",
      iconBg: "bg-gradient-to-br from-purple-500 to-pink-600",
    },
  ];

  const Section = ({
    icon: Icon,
    title,
    children,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    children: React.ReactNode;
  }) => (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          {title}
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );

  return (
    <div className="space-y-6">
      <Section icon={Calendar} title="Acontecendo Hoje">
        {peopleStats.map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </Section>

      <Section icon={MessageSquare} title="Status das Mensagens">
        {messageStats.map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </Section>

      <Section icon={ClipboardList} title="Avaliação Física">
        {evaluationStats.map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </Section>

      <Section icon={Users} title="Alunos">
        {studentStats.map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </Section>
    </div>
  );
}
