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

type Tone = "primary" | "whatsapp" | "success" | "warning" | "destructive" | "muted";

type Stat = {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  tone: Tone;
};

const toneStyles: Record<Tone, { bg: string; overlay: string }> = {
  primary: {
    bg: "bg-gradient-to-br from-primary to-primary-glow",
    overlay: "bg-gradient-to-br from-primary to-primary-glow",
  },
  whatsapp: {
    bg: "bg-whatsapp text-whatsapp-foreground",
    overlay: "bg-whatsapp",
  },
  success: {
    bg: "bg-success text-success-foreground",
    overlay: "bg-success",
  },
  warning: {
    bg: "bg-warning text-warning-foreground",
    overlay: "bg-warning",
  },
  destructive: {
    bg: "bg-destructive text-destructive-foreground",
    overlay: "bg-destructive",
  },
  muted: {
    bg: "bg-muted-foreground/70 text-background",
    overlay: "bg-muted-foreground",
  },
};

function StatCard({ stat }: { stat: Stat }) {
  const t = toneStyles[stat.tone];
  return (
    <Card className="overflow-hidden relative group hover:shadow-elegant transition-all duration-300 hover:-translate-y-0.5">
      <div className={`absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity ${t.overlay}`} />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
              {stat.title}
            </p>
            <p className="kpi-value text-4xl text-foreground leading-none">{stat.value}</p>
            <p className="text-xs text-muted-foreground pt-1">{stat.description}</p>
          </div>
          <div className={`p-3 rounded-xl shadow-lg shrink-0 text-white ${t.bg}`}>
            <stat.icon className="h-5 w-5" />
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
    { title: "Total de Alunos", value: v(stats?.totalStudents), icon: Users, description: "Cadastrados na base", tone: "primary" },
    { title: "Alunos Ativos", value: v(stats?.activeStudents), icon: Activity, description: "Com status ativo", tone: "success" },
    { title: "Alunos Inativos", value: v(stats?.inactiveStudents), icon: Users, description: "Sem status ativo", tone: "muted" },
    { title: "Novos no Mês", value: v(stats?.newStudentsMonth), icon: UserPlus, description: "Cadastrados este mês", tone: "primary" },
    { title: "Vencem em 3 dias", value: v(stats?.paymentDueIn3DaysCount), icon: CalendarClock, description: "Mensalidade próxima", tone: "warning" },
  ];

  const messageStats: Stat[] = [
    { title: "Próximas 24h", value: v(stats?.scheduledMessages), icon: Clock, description: "Programadas em breve", tone: "whatsapp" },
  ];

  const evaluationStats: Stat[] = [
    { title: "Nesta Semana", value: v(stats?.evaluationsWeek), icon: Calendar, description: "Programadas na semana", tone: "primary" },
    { title: "Nesse Mês", value: v(stats?.evaluationsMonth), icon: CalendarRange, description: "Programadas no mês", tone: "primary" },
    { title: "Atrasadas", value: v(stats?.evaluationsOverdue), icon: AlertTriangle, description: "Vencidas sem conclusão", tone: "destructive" },
    { title: "Concluídas no Mês", value: v(stats?.evaluationsCompletedMonth), icon: ClipboardCheck, description: "Finalizadas este mês", tone: "success" },
    { title: "Sem Avaliação", value: v(stats?.studentsWithoutEvaluation), icon: Users, description: "Alunos nunca avaliados", tone: "warning" },
  ];

  const peopleStats: Stat[] = [
    { title: "Para Enviar Hoje", value: v(stats?.messagesToSendToday), icon: Mail, description: "Agendadas para hoje", tone: "whatsapp" },
    { title: "Enviadas Hoje", value: v(stats?.messagesSentToday), icon: CheckCircle2, description: "Já entregues no dia", tone: "whatsapp" },
    { title: "Avaliações Hoje", value: v(stats?.evaluationsToday), icon: ClipboardList, description: "Agendadas para hoje", tone: "primary" },
    { title: "Aniversariantes", value: v(stats?.birthdaysToday), icon: Cake, description: "Fazem aniversário hoje", tone: "primary" },
    { title: "Mensalidades Vencidas", value: v(stats?.paymentOverdueCount), icon: DollarSign, description: "Alunos em atraso", tone: "destructive" },
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
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide font-sans">
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
