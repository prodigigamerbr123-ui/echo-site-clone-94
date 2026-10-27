import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import type { MessageReview } from "@/lib/messageReview";
import { useMessageReviewQueue } from "@/hooks/useMessageReviewQueue";
import { replaceNameVar } from "@/lib/phone";
import { hasUncertainDelivery } from "@/lib/messageDeliveryState";

interface Props {
  review: MessageReview;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(date) : "Data indisponível";
};

export function MessageReviewDialog({ review, saving, error, onBack, onConfirm }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [previewId, setPreviewId] = useState(review.recipients[0].id);
  const [queueAcknowledged, setQueueAcknowledged] = useState<string | null>(null);
  const [visibleQueue, setVisibleQueue] = useState(10);
  const queue = useMessageReviewQueue(review.recipients.map(student => student.id));
  const outstanding = queue.data ?? [];
  const queueVersion = JSON.stringify(outstanding.map(message => [message.id, message.updated_at, message.status, message.dispatch_started_at, message.content, message.scheduled_for]));
  const queueReady = !queue.isPending && !queue.isFetching && !queue.isError;
  const queueReviewed = outstanding.length === 0 || queueAcknowledged === queueVersion;
  const preview = review.recipients.find(student => student.id === previewId) ?? review.recipients[0];
  const needsReview = review.sharedPhones.length > 0 || review.inactive > 0;
  return <Dialog open onOpenChange={open => { if (!open && !saving) onBack(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Conferir mensagens</DialogTitle><DialogDescription>Confira quem receberá, o texto e a programação antes de confirmar.</DialogDescription></DialogHeader>
      <div className="space-y-4 text-sm">
        <div className="rounded-md border bg-muted/30 p-4"><p className="font-semibold">{review.recipients.length} aluno(s) · {review.total} mensagem(ns) previstas</p><p>{review.perStudent} envio(s) por aluno, incluindo a primeira mensagem e as repetições.</p></div>
        <details><summary className="cursor-pointer font-medium">Ver destinatários ({review.recipients.length})</summary><ul className="mt-2 max-h-40 overflow-y-auto space-y-1">{review.recipients.map(student => <li key={student.id}>{student.name} · {student.phone}{student.status === "inactive" ? " · Inativo" : ""}</li>)}</ul></details>
        {needsReview && <div className="rounded-md border border-amber-500/50 p-3 space-y-2">
          {review.inactive > 0 && <p>Há {review.inactive} aluno(s) inativo(s) selecionado(s). Confira se este contato faz sentido.</p>}
          {review.sharedPhones.length > 0 && <><p>Há cadastros selecionados com o mesmo WhatsApp. Cada cadastro gera suas próprias mensagens para esse número.</p><ul className="max-h-32 overflow-y-auto">{review.sharedPhones.map((names, index) => <li key={index}>{names.join(" · ")}</li>)}</ul></>}
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" disabled={saving} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>Conferi os destinatários inativos ou com WhatsApp compartilhado.</span></label>
        </div>}
        <section aria-label="Mensagens já programadas" className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Mensagens já programadas</h3><Button size="sm" variant="outline" disabled={saving || queue.isFetching} onClick={() => void queue.refetch()}>Atualizar fila</Button></div>
          {queue.isPending || queue.isFetching ? <p role="status">Conferindo os envios existentes…</p> : queue.isError ? <p role="alert" className="text-destructive">Não foi possível conferir a fila. Use Atualizar fila antes de confirmar; seu rascunho foi preservado.</p> : outstanding.length === 0 ? <p>Nenhum envio pendente, em processamento ou com resultado incerto para os alunos selecionados nesta consulta.</p> : <>
            <p>Há {outstanding.length} mensagem(ns) para conferir. Este novo envio será acrescentado à fila; as mensagens existentes não serão substituídas.</p>
            <ul className="max-h-52 overflow-y-auto divide-y">{outstanding.slice(0, visibleQueue).map(message => {
              const student = review.recipients.find(student => student.id === message.student_id);
              const sameText = student && message.content.trim() === replaceNameVar(review.message, student.name).trim();
              return <li key={message.id} className="py-2 space-y-1"><p className="font-medium">{student?.name ?? "Aluno"} · {message.status === "processing" ? "Em processamento" : hasUncertainDelivery(message) ? "Resultado incerto — confira no WhatsApp" : "Pendente"}</p><p className="text-xs text-muted-foreground">Programada para {dateLabel(message.scheduled_for)} · Brasília</p><p className="whitespace-pre-wrap break-words">{message.content}</p>{sameText && <p className="font-medium text-amber-700 dark:text-amber-400">Mesmo texto desta revisão: confira se precisa repetir.</p>}</li>;
            })}</ul>
            {outstanding.length > visibleQueue && <Button size="sm" variant="outline" disabled={saving} onClick={() => setVisibleQueue(current => current + 10)}>Ver mais ({outstanding.length - visibleQueue})</Button>}
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" disabled={saving} checked={queueAcknowledged === queueVersion} onChange={event => setQueueAcknowledged(event.target.checked ? queueVersion : null)} /><span>Conferi a fila e quero acrescentar estas novas mensagens.</span></label>
            <p className="text-xs text-muted-foreground">A fila pode mudar após esta consulta. Resultado incerto não confirma falha: confira o WhatsApp antes de repetir.</p>
          </>}
        </section>
        <div className="space-y-2"><label htmlFor="review-preview-student" className="font-medium">Conferir texto para</label><select id="review-preview-student" className="h-10 w-full rounded-md border bg-background px-3" value={previewId} disabled={saving} onChange={event => setPreviewId(event.target.value)}>{review.recipients.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select><WhatsAppPreview content={review.message} studentName={preview.name} /></div>
        <div className="rounded-md border p-3 space-y-2"><h3 className="font-medium">Programação · Brasília</h3>
          {review.schedule.kind === "now" ? <p>Entra na fila após confirmar, para tentativas nos próximos minutos.{review.spread.spread ? ` Distribuição estimada ao longo de ${review.spread.minutes} minutos, além da fila existente.` : " O horário exato depende da fila e da conexão."}</p>
            : <><p>Datas previstas para cada aluno:</p><ul className="max-h-36 overflow-y-auto list-disc pl-5">{review.dates.map(date => <li key={date}>{dateLabel(date)}</li>)}</ul></>}
          <p className="text-xs text-muted-foreground">Confirmar cria mensagens na fila. Isso não confirma entrega; acompanhe o resultado na Caixa de saída. A preferência de contato e a validade da programação serão conferidas novamente.</p>
        </div>
        {error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onBack}>Voltar e editar</Button><Button disabled={saving || !queueReady || !queueReviewed || (needsReview && !acknowledged)} onClick={onConfirm}>{saving ? "Confirmando…" : "Confirmar e colocar na fila"}</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}
