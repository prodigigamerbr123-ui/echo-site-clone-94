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
import { useAuth } from "@/hooks/useAuth";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

type Stat = {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  to?: string;
  gradient: string;
};

// Cores de cada indicador mantidas a pedido do dono; com destino, o card inteiro abre a lista.
function StatCard({ stat }: { stat: Stat }) {
  const body = (
    <>
      <div className={`absolute inset-0 opacity-5 transition-opacity group-hover:opacity-10 ${stat.gradient}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.title}</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">{stat.value}</p>
          <p className="text-xs text-muted-foreground">{stat.description}</p>
        </div>
        <div className={`shrink-0 rounded-xl p-3 shadow-lg ${stat.gradient}`}>
          <stat.icon aria-hidden className="h-5 w-5 text-white" />
        </div>
      </div>
    </>
  );
  const frame = "group relative block h-full overflow-hidden rounded-lg border bg-card p-5 transition-all duration-300";
  return stat.to
    ? <Link to={stat.to} className={`${frame} hover:-translate-y-0.5 hover:shadow-elegant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{body}</Link>
    : <div className={frame}>{body}</div>;
}

export function StatsOverview() {
  const { role } = useAuth();
  const canViewMessages = import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK);
  const { data: stats, isLoading, isError, refetch, isFetching } = useDashboardStats();
  const v = (n?: number | null) => (isLoading ? "..." : n == null ? "—" : n.toString());

  if (isError) return (
    <Card role="alert"><CardContent className="p-5 space-y-3">
      <p className="font-medium">Não foi possível atualizar os números do painel.</p>
      <p className="text-sm text-muted-foreground">Verifique a conexão e tente novamente.</p>
      <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>Tentar novamente</Button>
    </CardContent></Card>
  );

  const studentStats: Stat[] = [
    {
      title: "Total de alunos",
      to: "/alunos",
      gradient: "bg-gradient-to-br from-primary to-primary-glow",
      value: v(stats?.totalStudents),
      icon: Users,
      description: "Cadastrados na base",
    },
    {
      title: "Alunos ativos",
      to: "/alunos?status=active",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
      value: v(stats?.activeStudents),
      icon: Activity,
      description: "Com status ativo",
    },
    {
      title: "Alunos inativos",
      to: "/alunos?status=inactive",
      gradient: "bg-gradient-to-br from-slate-500 to-slate-700",
      value: v(stats?.inactiveStudents),
      icon: Users,
      description: "Sem status ativo",
    },
    {
      title: "Novos no mês",
      value: v(stats?.newStudentsMonth),
      icon: UserPlus,
      description: "Cadastrados este mês",
      gradient: "bg-gradient-to-br from-sky-500 to-blue-600",
    },
    {
      title: "Vencem em 3 dias",
      to: "/alunos?status=active&vencimento=due_soon",
      gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
      value: v(stats?.paymentDueIn3DaysCount),
      icon: CalendarClock,
      description: "Alunos ativos: hoje até 3 dias",
    },
  ];

  const messageStats: Stat[] = [
    {
      title: "Próximas 24h",
      to: "/caixa-de-saida?aba=agendadas",
      gradient: "bg-gradient-to-br from-[hsl(var(--warning))] to-orange-600",
      value: v(stats?.scheduledMessages),
      icon: Clock,
      description: "Programadas em breve",
    },
  ];

  const evaluationStats: Stat[] = [
    {
      title: "Nesta semana",
      to: "/agendar-avaliacao",
      gradient: "bg-gradient-to-br from-blue-500 to-indigo-600",
      value: v(stats?.evaluationsWeek),
      icon: Calendar,
      description: "Programadas na semana",
    },
    {
      title: "Nesse mês",
      to: "/agendar-avaliacao",
      gradient: "bg-gradient-to-br from-cyan-500 to-blue-600",
      value: v(stats?.evaluationsMonth),
      icon: CalendarRange,
      description: "Programadas no mês",
    },
    {
      title: "Atrasadas",
      to: "/agendar-avaliacao",
      gradient: "bg-gradient-to-br from-red-500 to-rose-600",
      value: v(stats?.evaluationsOverdue),
      icon: AlertTriangle,
      description: "Vencidas sem conclusão",
    },
    {
      title: "Concluídas no mês",
      to: "/avaliacao-fisica",
      gradient: "bg-gradient-to-br from-emerald-500 to-green-600",
      value: v(stats?.evaluationsCompletedMonth),
      icon: ClipboardCheck,
      description: "Finalizadas este mês",
    },
    {
      title: "Nunca avaliados",
      to: "/alunos?status=active&avaliacao=nunca",
      gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
      value: v(stats?.studentsWithoutEvaluation),
      icon: Users,
      description: "Alunos ativos sem nenhuma avaliação",
    },
  ];

  const peopleStats: Stat[] = [
    {
      title: "Para enviar hoje",
      to: "/caixa-de-saida?aba=agendadas",
      gradient: "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600",
      value: v(stats?.messagesToSendToday),
      icon: Mail,
      description: "Agendadas para hoje",
    },
    {
      title: "Enviadas hoje",
      to: "/caixa-de-saida?aba=enviadas",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
      value: v(stats?.messagesSentToday),
      icon: CheckCircle2,
      description: "Envios aceitos pelo provedor",
    },
    {
      title: "Avaliações hoje",
      to: "/agendar-avaliacao",
      gradient: "bg-gradient-to-br from-indigo-500 to-violet-600",
      value: v(stats?.evaluationsToday),
      icon: ClipboardList,
      description: "Agendadas para hoje",
    },
    {
      title: "Aniversariantes",
      value: v(stats?.birthdaysToday),
      icon: Cake,
      description: "Alunos ativos aniversariantes",
      gradient: "bg-gradient-to-br from-purple-500 to-pink-600",
    },
    {
      title: "Prazos vencidos",
      to: "/alunos?status=active&vencimento=overdue",
      gradient: "bg-gradient-to-br from-red-500 to-rose-600",
      value: v(stats?.paymentOverdueCount),
      icon: DollarSign,
      description: "Datas vencidas de alunos ativos; conferir renovação",
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
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon aria-hidden className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );

  return (
    <div className="space-y-6">
      <Section icon={Calendar} title="Acontecendo hoje">
        {(canViewMessages ? peopleStats : peopleStats.slice(2)).map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </Section>

      {canViewMessages && <Section icon={MessageSquare} title="Mensagens">
        {messageStats.map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </Section>}

      <Section icon={ClipboardList} title="Avaliação física">
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
