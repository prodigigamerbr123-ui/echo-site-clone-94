import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useDailyWork, useDeliveryIssues } from "@/hooks/useDashboardData";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";
import { QuickActions } from "./QuickActions";

type Attention = { title: string; value: number | null; description: string; to: string; tone: "danger" | "warning" };

// Linha inteira clicável: o número leva direto à lista que precisa de ação.
function AttentionRow({ item }: { item: Attention }) {
  return <li><Link to={item.to} className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className={`w-12 shrink-0 text-center text-3xl font-bold tabular-nums ${item.tone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{item.value ?? "—"}</span>
    <span className="min-w-0 flex-1"><span className="block font-semibold">{item.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{item.description}</span></span>
    <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
  </Link></li>;
}

const timeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

export function DailyWorkPanel() {
  const { role } = useAuth();
  const canContact = hasRole(role, FRONT_DESK);
  const work = useDailyWork();
  const issues = useDeliveryIssues();
  const [visibleActions, setVisibleActions] = useState(6);
  const snapshot = work.data;
  const refreshing = work.isFetching || issues.isFetching;
  const refresh = () => {
    void work.refetch();
    if (canContact) void issues.refetch();
  };

  if (work.isLoading) return <Card role="status"><CardContent className="p-6">Carregando a rotina da academia…</CardContent></Card>;
  if (work.isError || !snapshot) return <Card role="alert"><CardContent className="space-y-3 p-6">
    <p className="font-semibold">Não foi possível conferir as pendências.</p>
    <p className="text-sm text-muted-foreground">Atualize o painel antes de concluir que não há nada para fazer.</p>
    <Button variant="outline" disabled={refreshing} onClick={refresh}>Tentar novamente</Button>
  </CardContent></Card>;

  const { stats, agenda, actions } = snapshot;
  const orderedActions = [...actions].sort((a, b) => {
    const rank = { evaluation: 0, daqui_7_dias: 1, daqui_21_dias: 1, birthday: 2 };
    return rank[a.type] - rank[b.type] || a.name.localeCompare(b.name, "pt-BR");
  });
  const agendaRows = [...agenda].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  const issueCount = issues.isError ? null : issues.data ?? null;
  const checks: (Attention & { pending: boolean; loading?: boolean })[] = [
    ...(canContact ? [{ title: "Falhas de mensagem para revisar", value: issueCount, pending: !issues.isLoading && issueCount !== 0, loading: issues.isLoading, tone: "danger" as const, to: "/caixa-de-saida?aba=falhas",
      description: issues.isError ? "Não foi possível conferir as falhas. Abra a caixa de saída ou atualize o painel." : "Confira o motivo; depois reenvie ou marque como revisadas na Caixa de saída." }] : []),
    { title: "Avaliações aguardando baixa", value: stats.evaluationsOverdue, pending: stats.evaluationsOverdue > 0, tone: "warning", to: "/agendar-avaliacao",
      description: "Agendamentos de dias anteriores sem resultado. Registre realizada ou falta." },
    ...(canContact ? [
      { title: "Prazos vencidos", value: stats.paymentOverdueCount, pending: stats.paymentOverdueCount > 0, tone: "danger" as const, to: "/alunos?status=active&vencimento=overdue",
        description: "Confira a renovação ou atualize a data acordada. Não comprova dívida." },
      { title: "Prazos vencendo em até 3 dias", value: stats.paymentDueIn3DaysCount, pending: stats.paymentDueIn3DaysCount > 0, tone: "warning" as const, to: "/alunos?status=active&vencimento=due_soon",
        description: "Alunos ativos com vencimento de hoje até 3 dias." },
    ] : []),
  ];
  const pending = checks.filter(check => check.pending);
  // Item ainda carregando não é declarado em dia.
  const settled = checks.filter(check => !check.pending && !check.loading);

  return <section aria-label="Rotina da academia" className="space-y-6">
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Hoje na academia</h1><p className="mt-1 text-sm text-muted-foreground">Dados de {snapshot.day.split("-").reverse().join("/")}, às {timeLabel(snapshot.generatedAt)} · Brasília.</p></div>
        <Button variant="outline" onClick={refresh} disabled={refreshing} className="gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Atualizando…" : "Atualizar painel"}</Button>
      </div>
      <QuickActions />
    </div>
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">O que precisa de atenção</h2>
      {pending.length === 0
        ? <p className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm"><CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-success" />Nenhuma pendência nestes itens agora.</p>
        : <ul className="grid gap-2 lg:grid-cols-2">{pending.map(item => <AttentionRow key={item.title} item={item} />)}</ul>}
      {pending.length > 0 && settled.length > 0 && <p className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span>Em dia: {settled.map(item => item.title.toLowerCase()).join(" · ")}.</span></p>}
      {canContact && <Link to="/caixa-de-saida?aba=incertas" className="inline-block text-sm text-primary underline-offset-4 hover:underline">Conferir entregas incertas</Link>}
    </div>
    <div className={`grid gap-5 ${canContact ? "lg:grid-cols-2" : ""}`}>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5 text-primary" />Agenda de hoje</CardTitle><CardDescription>Compromissos em aberto. Registre realizada, falta ou cancelamento na agenda.</CardDescription></CardHeader><CardContent className="space-y-3">
        {agendaRows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum compromisso em aberto para hoje nesta consulta.</p> : <ul className="divide-y">{agendaRows.map(item => <li key={item.id} className="flex items-center gap-3 py-3"><Badge variant="outline">{timeLabel(item.scheduled_at)}</Badge><span className="min-w-0 flex-1 break-words text-sm font-medium">{item.name}</span><Button asChild variant="ghost" size="sm"><Link to="/agendar-avaliacao">Ver agenda</Link></Button></li>)}</ul>}
        {stats.evaluationsToday > agenda.length && <p className="text-xs text-muted-foreground">Exibindo {agenda.length} de {stats.evaluationsToday} compromissos. Consulte todos na agenda.</p>}
      </CardContent></Card>
      {canContact && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" />Contatos a conferir</CardTitle><CardDescription>Candidatos de avaliação, acompanhamento e aniversário, conforme os critérios do sistema. Abra a ficha antes de decidir o contato.</CardDescription></CardHeader><CardContent className="space-y-3">
        {orderedActions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contato sugerido por esses critérios. Isso não significa que todas as pendências da academia foram resolvidas.</p> : <>
          <p className="text-xs text-muted-foreground">{orderedActions.length} oportunidade(s) de contato; um aluno pode aparecer por mais de um motivo.</p>
          <ul className="divide-y">{orderedActions.slice(0, visibleActions).map(item => <li key={`${item.id}-${item.type}`} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.action}</p></div><Button asChild variant="outline" size="sm"><Link to={`/alunos?aluno=${encodeURIComponent(item.id)}`}>Abrir ficha</Link></Button></li>)}</ul>
          {orderedActions.length > visibleActions && <Button variant="ghost" className="w-full" onClick={() => setVisibleActions(value => value + 6)}>Mostrar mais contatos ({orderedActions.length - visibleActions})</Button>}
        </>}
      </CardContent></Card>}
    </div>
  </section>;
}
