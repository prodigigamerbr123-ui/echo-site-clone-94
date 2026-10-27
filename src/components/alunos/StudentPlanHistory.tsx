import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const showDate = (date: string | null) => date ? date.split("-").reverse().join("/") : "Não informado";
const showStamp = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
}).format(new Date(value));

export function StudentPlanHistory({ studentId, open }: { studentId: string; open: boolean }) {
  const [limit, setLimit] = useState(5);
  const query = useQuery({
    queryKey: ["student-plan-history", studentId, limit],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const { data, error, count } = await supabase.from("student_plan_history")
        .select("id,previous_plan,plan,previous_due_date,payment_due_date,created_at", { count: "exact" })
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(0, limit - 1);
      if (error) throw error;
      if (count === null || !data) throw new Error("Não foi possível confirmar o histórico do plano.");
      return { rows: data, count };
    },
  });

  return <section aria-label="Histórico de plano e vencimento" className="rounded-lg border p-3 space-y-3 text-sm">
    <h2 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-primary" />Histórico de plano e vencimento</h2>
    <p className="text-xs text-muted-foreground">Renovações e ajustes registrados a partir da ativação deste histórico. Não comprova pagamento.</p>
    {query.isError ? <div role="alert" className="space-y-2"><p className="text-destructive">Não foi possível consultar o histórico do plano.</p><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Consultar histórico novamente</Button></div>
      : query.isLoading ? <p role="status" className="text-muted-foreground">Carregando alterações do plano…</p>
      : !query.data?.rows.length ? <p className="text-muted-foreground">Nenhuma alteração registrada neste histórico. Mudanças antigas não foram reconstruídas.</p>
      : <>
        <ol className="divide-y">{query.data.rows.map(row => <li key={row.id} className="space-y-2 py-3 first:pt-0">
          <p className="font-medium">{showStamp(row.created_at)} · Brasília</p>
          {row.previous_plan === row.plan ? <p className="text-muted-foreground">Plano mantido: {row.plan || "Não informado"}</p> : <dl className="grid grid-cols-2 gap-2"><div><dt className="text-xs text-muted-foreground">Plano anterior</dt><dd className="break-words">{row.previous_plan || "Não informado"}</dd></div><div><dt className="text-xs text-muted-foreground">Plano após alteração</dt><dd className="break-words">{row.plan || "Não informado"}</dd></div></dl>}
          {row.previous_due_date === row.payment_due_date ? <p className="text-muted-foreground">Vencimento mantido: {showDate(row.payment_due_date)}</p> : <dl className="grid grid-cols-2 gap-2"><div><dt className="text-xs text-muted-foreground">Vencimento anterior</dt><dd>{showDate(row.previous_due_date)}</dd></div><div><dt className="text-xs text-muted-foreground">Novo vencimento</dt><dd>{showDate(row.payment_due_date)}</dd></div></dl>}
        </li>)}</ol>
        <p className="text-xs text-muted-foreground">Exibindo {query.data.rows.length} de {query.data.count} alteração(ões).</p>
        {query.data.count > query.data.rows.length && <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => setLimit(value => value + 5)}>Ver alterações anteriores</Button>}
      </>}
  </section>;
}
