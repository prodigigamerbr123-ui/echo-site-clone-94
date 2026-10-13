import { evaluationResult, type EvaluationResult } from "../../supabase/functions/_shared/contracts";
import { supabase } from "@/integrations/supabase/client";
import { buildEvaluationMessages, applyLinkedEvaluationTemplates, buildFollowup, buildReschedule } from "./evaluationMessages";
import { fetchAutomationSettings, isAutomationEnabled, getAutomationParam } from "./automationSettings";
import { resolveAutomationMessage } from "./messageTemplates";
import { spParts, spDate } from "./spTime";

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
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Intervalo de acompanhamento inválido");
    const p = spParts(new Date(Date.now() + days * 86400000));
    const when = spDate(p.y, p.mo, p.d, 9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
    const type = outcome === "completed" ? "evaluation_followup" : "evaluation_reschedule";
    const content = await resolveAutomationMessage(key, type, outcome === "completed" ? buildFollowup(name) : buildReschedule(name), { nome: name }, settings);
    messages.push({ content, scheduled_for: when.toISOString(), message_type: type });
  }
  const { data, error } = await supabase.rpc("mutate_evaluation_tx", {
    _action: outcome, _evaluation_id: evaluationId, _messages: messages,
  });
  if (error) throw error;
  return evaluationResult(data);
}
