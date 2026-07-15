// Textos e helpers para as mensagens automáticas geradas a partir de uma
// avaliação física (evaluations). Mantém o mesmo padrão de "sortear entre
// variações" usado no daily-automation.

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Tpl = (name: string, when: Date) => string;

const CONFIRMATION_TEMPLATES: Tpl[] = [
  (n, w) =>
    `Olá ${n}! ✅ Sua avaliação física está marcada para ${format(w, "dd/MM", { locale: ptBR })} às ${format(w, "HH:mm")}. Qualquer imprevisto, é só me avisar!`,
  (n, w) =>
    `Oi ${n}! 📅 Confirmado: avaliação física em ${format(w, "dd/MM", { locale: ptBR })} às ${format(w, "HH:mm")}. Te espero! 💪`,
  (n, w) =>
    `${n}, tudo certo! ✅ Sua avaliação está agendada pra ${format(w, "dd/MM", { locale: ptBR })} às ${format(w, "HH:mm")}. Se precisar remarcar é só falar.`,
];

const REMINDER_1D_TEMPLATES: Tpl[] = [
  (n, w) =>
    `Oi ${n}! 👋 Passando pra lembrar da sua avaliação física amanhã às ${format(w, "HH:mm")}. Bora acompanhar sua evolução!`,
  (n, w) =>
    `${n}, amanhã é dia! 📋 Sua avaliação física está marcada pra ${format(w, "HH:mm")}. Te vejo lá! 💪`,
  (n, w) =>
    `Lembrete rápido, ${n}: amanhã tem avaliação física às ${format(w, "HH:mm")}. Qualquer coisa é só me chamar. ✅`,
];

const REMINDER_DAY_TEMPLATES: Tpl[] = [
  (n, w) =>
    `Oi ${n}! ⏰ Sua avaliação física é hoje às ${format(w, "HH:mm")}. Já já te vejo! 💪`,
  (n, w) =>
    `${n}, tá chegando a hora! 🏋️ Avaliação física hoje às ${format(w, "HH:mm")}. Te espero!`,
  (n, w) =>
    `Lembrete de hoje, ${n}: avaliação física às ${format(w, "HH:mm")}. Se precisar remarcar, me avisa!`,
];

const FOLLOWUP_TEMPLATES = [
  (n: string) =>
    `Olá ${n}! 📈 Como foi sua avaliação física? Vamos acompanhar sua evolução juntos! 💪`,
  (n: string) =>
    `E aí ${n}! Passando pra saber como você está depois da avaliação. Bora ajustar o que precisar! 🏋️`,
  (n: string) =>
    `${n}, tudo certo? Já se passou uma semana da sua avaliação — conta pra gente como está o treino! 💪`,
];

const RESCHEDULE_TEMPLATES = [
  (n: string) =>
    `Oi ${n}! Sentimos sua falta na avaliação ontem 😊 Vamos remarcar? Me fala qual dia fica melhor pra você!`,
  (n: string) =>
    `${n}, notamos que você não conseguiu vir na avaliação. 📅 Sem problema — quando podemos remarcar?`,
  (n: string) =>
    `E aí ${n}! Ficamos com saudades ontem. Bora reagendar sua avaliação física? Me diz o melhor dia!`,
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
 * Gera até 3 mensagens automáticas para uma avaliação recém-agendada:
 * - CONFIRMAÇÃO: agora + 2 minutos
 * - LEMBRETE VÉSPERA: dia anterior às 18:00 (só se ainda estiver no futuro)
 * - LEMBRETE NO DIA: 3h antes (só se estiver no futuro; e >=12h depois da véspera,
 *   senão substitui a véspera)
 */
export function buildEvaluationMessages(
  studentName: string,
  scheduledAt: Date,
): EvaluationMessage[] {
  const now = new Date();
  const msgs: EvaluationMessage[] = [];

  // 1) Confirmação
  const confirmAt = new Date(now.getTime() + 2 * 60 * 1000);
  msgs.push({
    scheduled_for: confirmAt.toISOString(),
    message_type: "evaluation_confirmation",
    content: buildConfirmation(studentName, scheduledAt),
  });

  // 2) Véspera 18:00
  const eve = new Date(scheduledAt);
  eve.setDate(eve.getDate() - 1);
  eve.setHours(18, 0, 0, 0);
  const eveInFuture = eve.getTime() > now.getTime();

  // 3) 3h antes
  const dayOf = new Date(scheduledAt.getTime() - 3 * 60 * 60 * 1000);
  const dayOfInFuture = dayOf.getTime() > now.getTime();

  const gap = dayOf.getTime() - eve.getTime();
  const collision = gap < 12 * 60 * 60 * 1000;

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

export const AUTO_EVAL_MESSAGE_TYPES = [
  "evaluation_confirmation",
  "evaluation_reminder_1d",
  "evaluation_reminder_day",
] as const;
