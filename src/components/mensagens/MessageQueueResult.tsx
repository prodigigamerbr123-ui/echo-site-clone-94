import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { MessageReview } from "@/lib/messageReview";

export interface ConfirmedMessageOperation {
  queued: number;
  replayed: boolean;
  review: MessageReview;
}

interface Props {
  operation: ConfirmedMessageOperation;
  onNewMessage: () => void;
}

export function MessageQueueResult({ operation: { queued, replayed, review }, onNewMessage }: Props) {
  return <section aria-label="Resultado da programação" aria-live="polite" className="rounded-lg border bg-card p-5 space-y-4">
    <h2 className="text-xl font-semibold">{replayed ? "Confirmação recuperada" : queued === 0 ? "Nenhuma nova mensagem foi criada" : "Programação registrada"}</h2>
    <p className="text-lg font-medium">{queued} mensagem(ns) registrada(s) nesta operação</p>
    <p className="text-sm text-muted-foreground">{review.recipients.length} aluno(s) selecionado(s) na revisão · {review.total} mensagem(ns) previstas, incluindo repetições.</p>
    {replayed && <p className="rounded-md border p-3 text-sm">A tentativa anterior já estava registrada. Esta confirmação recuperou o resultado sem criar mensagens extras.</p>}
    {queued !== review.total && <p className="rounded-md border border-amber-500/50 p-3 text-sm">A quantidade registrada difere da revisão. Confira a Caixa de saída antes de preparar outro envio. A preferência de contato ou os envios existentes podem ter mudado.</p>}
    <details className="text-sm"><summary className="cursor-pointer font-medium">Conferir os dados desta programação</summary><div className="mt-3 space-y-3"><ul className="max-h-32 overflow-y-auto">{review.recipients.map(student => <li key={student.id}>{student.name}</li>)}</ul><p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">{review.message}</p><p>{review.schedule.kind === "now" ? "Envio solicitado para os próximos minutos, sujeito à fila e à conexão." : "Envios programados para as datas conferidas na revisão."}</p></div></details>
    <p className="text-sm">Este resultado confirma o registro da operação. A situação atual das tentativas fica na Caixa de saída; entrega ou leitura no WhatsApp não foram confirmadas aqui.</p>
    <div className="flex flex-wrap gap-2">
      <Button asChild><Link to="/caixa-de-saida?aba=agendadas">Abrir Caixa de saída</Link></Button>
      {review.recipients.length === 1 && <Button asChild variant="outline"><Link to={`/alunos?aluno=${encodeURIComponent(review.recipients[0].id)}`}>Abrir ficha do aluno</Link></Button>}
      <Button variant="outline" onClick={onNewMessage}>Preparar outra mensagem</Button>
    </div>
  </section>;
}
