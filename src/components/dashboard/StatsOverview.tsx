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
};

// Bloco neutro; com destino, o bloco inteiro abre a lista correspondente.
function StatCard({ stat }: { stat: Stat }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
        <stat.icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{stat.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
    </>
  );
  const frame = "block h-full rounded-lg border bg-card p-4";
  return stat.to
    ? <Link to={stat.to} className={`${frame} transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{body}</Link>
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
      value: v(stats?.totalStudents),
      icon: Users,
      description: "Cadastrados na base",
    },
    {
      title: "Alunos ativos",
      to: "/alunos?status=active",
      value: v(stats?.activeStudents),
      icon: Activity,
      description: "Com status ativo",
    },
    {
      title: "Alunos inativos",
      to: "/alunos?status=inactive",
      value: v(stats?.inactiveStudents),
      icon: Users,
      description: "Sem status ativo",
    },
    {
      title: "Novos no mês",
      value: v(stats?.newStudentsMonth),
      icon: UserPlus,
      description: "Cadastrados este mês",
    },
    {
      title: "Vencem em 3 dias",
      to: "/alunos?status=active&vencimento=due_soon",
      value: v(stats?.paymentDueIn3DaysCount),
      icon: CalendarClock,
      description: "Alunos ativos: hoje até 3 dias",
    },
  ];

  const messageStats: Stat[] = [
    {
      title: "Próximas 24h",
      to: "/caixa-de-saida?aba=agendadas",
      value: v(stats?.scheduledMessages),
      icon: Clock,
      description: "Programadas em breve",
    },
  ];

  const evaluationStats: Stat[] = [
    {
      title: "Nesta semana",
      to: "/agendar-avaliacao",
      value: v(stats?.evaluationsWeek),
      icon: Calendar,
      description: "Programadas na semana",
    },
    {
      title: "Nesse mês",
      to: "/agendar-avaliacao",
      value: v(stats?.evaluationsMonth),
      icon: CalendarRange,
      description: "Programadas no mês",
    },
    {
      title: "Atrasadas",
      to: "/agendar-avaliacao",
      value: v(stats?.evaluationsOverdue),
      icon: AlertTriangle,
      description: "Vencidas sem conclusão",
    },
    {
      title: "Concluídas no mês",
      to: "/avaliacao-fisica",
      value: v(stats?.evaluationsCompletedMonth),
      icon: ClipboardCheck,
      description: "Finalizadas este mês",
    },
    {
      title: "Nunca avaliados",
      to: "/alunos?status=active&avaliacao=nunca",
      value: v(stats?.studentsWithoutEvaluation),
      icon: Users,
      description: "Alunos ativos sem nenhuma avaliação",
    },
  ];

  const peopleStats: Stat[] = [
    {
      title: "Para enviar hoje",
      to: "/caixa-de-saida?aba=agendadas",
      value: v(stats?.messagesToSendToday),
      icon: Mail,
      description: "Agendadas para hoje",
    },
    {
      title: "Enviadas hoje",
      to: "/caixa-de-saida?aba=enviadas",
      value: v(stats?.messagesSentToday),
      icon: CheckCircle2,
      description: "Envios aceitos pelo provedor",
    },
    {
      title: "Avaliações hoje",
      to: "/agendar-avaliacao",
      value: v(stats?.evaluationsToday),
      icon: ClipboardList,
      description: "Agendadas para hoje",
    },
    {
      title: "Aniversariantes",
      value: v(stats?.birthdaysToday),
      icon: Cake,
      description: "Alunos ativos aniversariantes",
    },
    {
      title: "Prazos vencidos",
      to: "/alunos?status=active&vencimento=overdue",
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
        <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{children}</div>
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
