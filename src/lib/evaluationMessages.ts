import { resolveAutomationMessage } from "@/lib/messageTemplates";
import { fmtDateSP, fmtTimeSP } from "@/lib/spTime";
import type { EvaluationMessage } from "../../supabase/functions/_shared/evaluationPolicy";
export { buildConfirmation, buildReminder1d, buildReminderDay, buildFollowup, buildReschedule, buildEvaluationMessages } from "../../supabase/functions/_shared/evaluationPolicy";
export type { EvaluationMessage } from "../../supabase/functions/_shared/evaluationPolicy";

export const AUTO_EVAL_MESSAGE_TYPES = [
  "evaluation_confirmation",
  "evaluation_reminder_1d",
  "evaluation_reminder_day",
  "evaluation_followup",
  "evaluation_reschedule",
] as const;

/**
 * Substitui o content de cada mensagem pelo template pré-definido linkado
 * (se houver) na automação "evaluation_reminders". Placeholders suportados:
 * {nome}, {data}, {hora}.
 */
export async function applyLinkedEvaluationTemplates(
  msgs: EvaluationMessage[],
  studentName: string,
  scheduledAt: Date,
): Promise<void> {
  const vars = {
    nome: studentName,
    data: fmtDateSP(scheduledAt),
    hora: fmtTimeSP(scheduledAt),
  };
  for (const m of msgs) {
    m.content = await resolveAutomationMessage(
      "evaluation_reminders",
      m.message_type,
      m.content,
      vars,
    );
  }
}



