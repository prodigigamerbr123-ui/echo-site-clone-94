import { fmtDateSP, fmtTimeSP, spDate, spParts } from "./spTime.ts";

type Tpl = (name: string, when: Date) => string;


const CONFIRMATION_TEMPLATES: Tpl[] = [
  (n, w) =>
    `Olá ${n}! ✅ Sua avaliação física está marcada para ${fmtDateSP(w)} às ${fmtTimeSP(w)}. Qualquer imprevisto, é só me avisar!`,
  (n, w) =>
    `Oi ${n}! 📅 Confirmado: avaliação física em ${fmtDateSP(w)} às ${fmtTimeSP(w)}. Te espero! 💪`,
  (n, w) =>
    `${n}, tudo certo! ✅ Sua avaliação está agendada pra ${fmtDateSP(w)} às ${fmtTimeSP(w)}. Se precisar remarcar é só falar.`,
];

const REMINDER_1D_TEMPLATES: Tpl[] = [
  (n, w) =>
    `Oi ${n}! 👋 Passando pra lembrar da sua avaliação física amanhã às ${fmtTimeSP(w)}. Bora acompanhar sua evolução!`,
  (n, w) =>
    `${n}, amanhã é dia! 📋 Sua avaliação física está marcada pra ${fmtTimeSP(w)}. Te vejo lá! 💪`,
  (n, w) =>
    `Lembrete rápido, ${n}: amanhã tem avaliação física às ${fmtTimeSP(w)}. Qualquer coisa é só me chamar. ✅`,
];

const REMINDER_DAY_TEMPLATES: Tpl[] = [
  (n, w) =>
    `Oi ${n}! ⏰ Sua avaliação física é hoje às ${fmtTimeSP(w)}. Já já te vejo! 💪`,
  (n, w) =>
    `${n}, tá chegando a hora! 🏋️ Avaliação física hoje às ${fmtTimeSP(w)}. Te espero!`,
  (n, w) =>
    `Lembrete de hoje, ${n}: avaliação física às ${fmtTimeSP(w)}. Se precisar remarcar, me avisa!`,
];

const FOLLOWUP_TEMPLATES = [
  (n: string) =>
    `Olá ${n}! 📈 Como foi sua avaliação física? Vamos acompanhar sua evolução juntos! 💪`,
  (n: string) =>
    `E aí ${n}! Passando pra saber como você está depois da avaliação. Bora ajustar o que precisar! 🏋️`,
  (n: string) =>
    `${n}, tudo certo? Passando para acompanhar sua evolução após a avaliação — conta pra gente como está o treino! 💪`,
];

const RESCHEDULE_TEMPLATES = [
  (n: string) =>
    `Oi ${n}! Sentimos sua falta na avaliação 😊 Vamos combinar outro horário? Me fala qual dia fica melhor pra você!`,
  (n: string) =>
    `${n}, notamos que você não conseguiu vir na avaliação. 📅 Sem problema — quando podemos remarcar?`,
  (n: string) =>
    `E aí ${n}! Queremos combinar sua avaliação física de novo. Me diz o melhor dia para você!`,
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export const buildConfirmation = (name: string, when: Date) =>
  pick(CONFIRMATION_TEMPLATES)(name, when);
export const buildReminder1d = (name: string, when: Date) =>
  pick(REMINDER_1D_TEMPLATES)(name, when);
export const buildReminderDay = (name: string, when: Date) =>
  pick(REMINDER_DAY_TEMPLATES)(name, when);
export const buildFollowup = (name: string) => pick(FOLLOWUP_TEMPLATES)(name);
export const buildReschedule = (name: string) => pick(RESCHEDULE_TEMPLATES)(name);

export interface EvaluationMessage {
  scheduled_for: string;
  message_type: string;
  content: string;
}

/**
 * Gera até 3 mensagens automáticas para uma avaliação recém-agendada.
 * Horários calculados no fuso SP (UTC-3), independentes do fuso do navegador:
 *  - CONFIRMAÇÃO: agora + 2 minutos
 *  - LEMBRETE VÉSPERA: dia anterior às 18:00 SP (só se ainda estiver no futuro)
 *  - LEMBRETE NO DIA: 3h antes (só se estiver no futuro; e >=12h depois da véspera,
 *    senão substitui a véspera)
 */
export function buildEvaluationMessages(
  studentName: string,
  scheduledAt: Date,
  now = new Date(),
): EvaluationMessage[] {
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= now) {
    throw new Error("Data deve ser futura");
  }
  const msgs: EvaluationMessage[] = [];

  // 1) Confirmação: agora + 2 min
  const confirmAt = new Date(now.getTime() + 2 * 60 * 1000);
  msgs.push({
    scheduled_for: confirmAt.toISOString(),
    message_type: "evaluation_confirmation",
    content: buildConfirmation(studentName, scheduledAt),
  });

  // 2) Véspera às 18:00 SP — usa Date UTC auxiliar pra decrementar o dia
  //    corretamente inclusive na virada de mês.
  const p = spParts(scheduledAt);
  const eveTmp = new Date(Date.UTC(p.y, p.mo, p.d - 1));
  const eve = spDate(
    eveTmp.getUTCFullYear(),
    eveTmp.getUTCMonth(),
    eveTmp.getUTCDate(),
    18,
    0,
  );
  const eveInFuture = eve.getTime() > now.getTime();

  // 3) Dia -3h
  const dayOf = new Date(scheduledAt.getTime() - 3 * 60 * 60 * 1000);
  const dayOfInFuture = dayOf.getTime() > now.getTime();

  const collision = dayOf.getTime() - eve.getTime() < 12 * 60 * 60 * 1000;

  if (eveInFuture && !collision) {
    msgs.push({
      scheduled_for: eve.toISOString(),
      message_type: "evaluation_reminder_1d",
      content: buildReminder1d(studentName, scheduledAt),
    });
  }
  if (dayOfInFuture) {
    msgs.push({
      scheduled_for: dayOf.toISOString(),
      message_type: "evaluation_reminder_day",
      content: buildReminderDay(studentName, scheduledAt),
    });
  }

  return msgs;
}

/** Completion-based follow-up, shared by browser and AI entry points. */
export function planEvaluationFollowup(
  name: string, outcome: "completed" | "no_show", daysAfter: number,
  now = new Date(), random = Math.random,
): EvaluationMessage {
  const days = outcome === "completed" ? daysAfter : 1;
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Intervalo de acompanhamento inválido");
  }
  const parts = spParts(new Date(now.getTime() + days * 86_400_000));
  const when = spDate(parts.y, parts.mo, parts.d, 9 + Math.floor(random() * 3), Math.floor(random() * 60));
  return {
    content: outcome === "completed" ? buildFollowup(name) : buildReschedule(name),
    scheduled_for: when.toISOString(),
    message_type: outcome === "completed" ? "evaluation_followup" : "evaluation_reschedule",
  };
}
