import { evaluationResult, type EvaluationResult } from "../../supabase/functions/_shared/contracts";
import { supabase } from "@/integrations/supabase/client";
import { buildEvaluationMessages, applyLinkedEvaluationTemplates } from "./evaluationMessages";
import { fetchAutomationSettings, isAutomationEnabled, getAutomationParam } from "./automationSettings";
import { resolveAutomationMessage } from "./messageTemplates";
import { planEvaluationFollowup } from "../../supabase/functions/_shared/evaluationPolicy";

export type EvaluationActionResult = EvaluationResult;

export async function saveEvaluationWithMessages(
  studentId: string, name: string, scheduledAt: Date, notes: string | null,
  evaluationId?: string, allowConflict = false,
): Promise<EvaluationActionResult> {
  const settings = await fetchAutomationSettings();
  const messages = isAutomationEnabled(settings, "evaluation_reminders") ? buildEvaluationMessages(name, scheduledAt) : [];
  await applyLinkedEvaluationTemplates(messages, name, scheduledAt);
  const { data, error } = await supabase.rpc("mutate_evaluation_tx", {
    _action: evaluationId ? "reschedule" : "create", _evaluation_id: evaluationId ?? crypto.randomUUID(),
    _student_id: studentId, _scheduled_at: scheduledAt.toISOString(), _notes: notes,
    _messages: messages.map((message) => ({ ...message })), _allow_conflict: allowConflict,
  });
  if (error) throw error;
  return evaluationResult(data);
}

export async function finishEvaluationWithMessages(
  evaluationId: string, name: string, outcome: "completed" | "no_show" | "cancel",
): Promise<EvaluationActionResult> {
  if (outcome === "cancel") {
    const { data, error } = await supabase.rpc("mutate_evaluation_tx", { _action: "cancel", _evaluation_id: evaluationId, _messages: [] });
    if (error) throw error;
    return evaluationResult(data);
  }
  const settings = await fetchAutomationSettings();
  const key = outcome === "completed" ? "evaluation_followup" : "no_show_reschedule";
  const messages = [];
  if (isAutomationEnabled(settings, key)) {
    // Follow-up starts at completion, including when closing an old appointment.
    const days = outcome === "completed" ? Number(getAutomationParam(settings, key, "days_after", 7)) : 1;
    const message = planEvaluationFollowup(name, outcome, days);
    message.content = await resolveAutomationMessage(key, message.message_type, message.content, { nome: name }, settings);
    messages.push(message);
  }
  const { data, error } = await supabase.rpc("mutate_evaluation_tx", {
    _action: outcome, _evaluation_id: evaluationId, _messages: messages.map(message => ({ ...message })),
  });
  if (error) throw error;
  return evaluationResult(data);
}
