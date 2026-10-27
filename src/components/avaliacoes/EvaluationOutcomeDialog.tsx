import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isAutomationEnabled, type AutomationSettingsMap } from "@/lib/automationSettings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validPerformedDate } from "@/lib/evaluationPerformedDate";
import { fmtDateISOSP, spIsToday } from "@/lib/spTime";
import type { AgendaEvaluation } from "./agendaTypes";

export type EvaluationOutcome = "completed" | "no_show" | "cancel";
interface Props {
  evaluation: AgendaEvaluation;
  outcome: EvaluationOutcome;
  now: number;
  settings: AutomationSettingsMap | undefined;
  settingsUnavailable: boolean;
  messagesAllowed?: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (sendAutomaticMessage: boolean, performedOn?: string) => void;
}

export function EvaluationOutcomeDialog({ evaluation, outcome, now, settings, settingsUnavailable, messagesAllowed = true, saving, error, onClose, onConfirm }: Props) {
  const scheduled = new Date(evaluation.scheduled_at);
  const oldAppointment = scheduled.getTime() < now && !spIsToday(scheduled, new Date(now));
  const early = scheduled.getTime() > now;
  const automationKey = outcome === "completed" ? "evaluation_followup" : "no_show_reschedule";
  const enabled = messagesAllowed && !settingsUnavailable && isAutomationEnabled(settings, automationKey);
  const [sendMessage, setSendMessage] = useState(!oldAppointment && enabled);
  const [performedOn, setPerformedOn] = useState(oldAppointment ? "" : fmtDateISOSP(scheduled));
  const [reviewedDate, setReviewedDate] = useState(false);
  const [earlyCompletion, setEarlyCompletion] = useState(false);
  const title = outcome === "completed" ? "Registrar avaliação realizada" : outcome === "no_show" ? "Registrar falta" : "Cancelar avaliação";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(scheduled);
  const dateNeedsReview = outcome !== "cancel" && (oldAppointment || (outcome === "completed" && performedOn !== fmtDateISOSP(scheduled)));
  const futureDay = early && !spIsToday(scheduled, new Date(now));
  const blocked = (outcome === "completed" && !validPerformedDate(performedOn, new Date(now))) || (outcome !== "cancel" && (futureDay || (early && (outcome === "no_show" || !earlyCompletion)) || (dateNeedsReview && !reviewedDate)));

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Confira o compromisso e as consequências antes de salvar.</DialogDescription></DialogHeader>
    <div className="space-y-4 text-sm">
      <div className="rounded-md bg-muted p-4 space-y-1"><p className="font-semibold">{evaluation.students?.name ?? "Aluno"}</p><p>Compromisso: {dateLabel} · Brasília</p>{evaluation.notes && <p className="text-muted-foreground">{evaluation.notes}</p>}</div>
      {outcome === "completed" ? <div className="space-y-3"><p>Informe o dia em que o atendimento realmente aconteceu. O horário marcado será preservado e a baixa ficará registrada agora.</p><div className="space-y-2"><Label htmlFor="evaluation-performed-on">Data real do atendimento *</Label><div className="flex gap-2"><Input id="evaluation-performed-on" type="date" value={performedOn} max={fmtDateISOSP(new Date(now))} disabled={saving} onChange={event => { setPerformedOn(event.target.value); setReviewedDate(false); }} /><Button variant="outline" disabled={saving} onClick={() => { setPerformedOn(fmtDateISOSP(new Date(now))); setReviewedDate(false); }}>Hoje</Button></div><p className="text-xs text-muted-foreground">Essa data será usada como referência da última avaliação do aluno. Não use a data da baixa se o atendimento aconteceu antes.</p>{performedOn && !validPerformedDate(performedOn, new Date(now)) && <p role="alert" className="text-destructive">Informe uma data válida até hoje.</p>}</div></div>
        : outcome === "no_show" ? <p>O histórico registrará que o aluno faltou. Nenhuma nova avaliação será marcada automaticamente; você poderá combinar outro horário depois.</p>
        : <p>O compromisso ficará cancelado e será preservado no histórico. Isso não registra falta nem avaliação realizada.</p>}
      {dateNeedsReview && <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 space-y-2"><p>Confira se o resultado e a data do atendimento correspondem a este compromisso. Em registros antigos, verifique também se ainda faz sentido preparar mensagem agora.</p>{dateNeedsReview && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={reviewedDate} disabled={saving} onChange={event => setReviewedDate(event.target.checked)} /><span>{outcome === "completed" ? "Conferi que este resultado e a data informada correspondem ao compromisso acima." : "Conferi que esta falta corresponde ao compromisso acima."}</span></label>}</div>}
      {early && outcome !== "cancel" && <div className="rounded-md border p-3">{futureDay ? <p>Não é possível fechar uma avaliação de um dia futuro. Use remarcar ou cancelar.</p> : outcome === "no_show" ? <p>Aguarde o horário do compromisso antes de registrar uma falta.</p> : <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" disabled={saving} checked={earlyCompletion} onChange={event => setEarlyCompletion(event.target.checked)} /><span>O atendimento foi antecipado e já aconteceu na data informada.</span></label>}</div>}
      {outcome !== "cancel" && <div className="rounded-md border p-3 space-y-2">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={sendMessage && enabled} disabled={saving || !enabled} onChange={event => setSendMessage(event.target.checked)} /><span>{outcome === "completed" ? "Preparar mensagem automática de acompanhamento" : "Preparar convite automático para combinar outro horário"}</span></label>
        <p className="text-xs text-muted-foreground">{!messagesAllowed ? "O aluno está com mensagens desativadas. O resultado será salvo sem preparar mensagem." : settingsUnavailable ? "Não foi possível confirmar a automação. Você pode salvar o resultado sem preparar mensagem." : enabled ? "Só será programada se a automação continuar habilitada no momento de salvar. O resultado será informado após a gravação." : "A automação está desligada. O resultado será salvo sem preparar mensagem."}</p>
        {enabled && sendMessage && oldAppointment && <p className="text-xs text-muted-foreground">O prazo da mensagem conta a partir desta baixa, não da data antiga do compromisso. Confira os textos das automações para evitar referências a datas incorretas.</p>}
      </div>}
      <p className="text-xs text-muted-foreground">Lembretes pendentes deste compromisso serão cancelados. Um envio que já começou ainda pode chegar ao aluno.</p>
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{error} Confira a agenda antes de repetir se a conexão foi interrompida.</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>Voltar</Button><Button variant={outcome === "completed" ? "default" : "destructive"} disabled={saving || blocked} onClick={() => outcome === "completed" ? onConfirm(enabled && sendMessage, performedOn) : onConfirm(outcome !== "cancel" && enabled && sendMessage)}>{saving ? "Salvando…" : title}</Button></div>
    </div>
  </DialogContent></Dialog>;
}
