import { scheduleConflictResult } from "../../supabase/functions/_shared/evaluationConflicts";
import { evaluationResult, type EvaluationResult } from "../../supabase/functions/_shared/contracts";
import { supabase } from "@/integrations/supabase/client";
import { buildEvaluationMessages, applyLinkedEvaluationTemplates } from "./evaluationMessages";
import { fetchAutomationSettings, isAutomationEnabled, getAutomationParam } from "./automationSettings";
import { resolveAutomationMessage } from "./messageTemplates";
import { planEvaluationFollowup } from "../../supabase/functions/_shared/evaluationPolicy";
import { assertEvaluationIdentity, completeEvaluationIntent, evaluationUserId, prepareEvaluationIntent, type EvaluationIntent } from "./evaluationIntent";

export type EvaluationActionResult = EvaluationResult;

/** Reconcile a lost response before duplicate checks, including after its scheduled time. */
export async function recoverEvaluationCreation(intent: EvaluationIntent, studentId: string, when: Date, notes: string | null) {
  await assertEvaluationIdentity(intent);
  const { data, error } = await supabase.from("evaluations")
    .select("id,student_id,scheduled_at,notes,status").eq("id", intent.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.student_id !== studentId || Date.parse(data.scheduled_at) !== when.getTime() ||
      data.notes !== notes || data.status !== "scheduled") {
    throw new Error("A avaliação desta tentativa foi alterada. Confira a agenda antes de continuar");
  }
  await assertEvaluationIdentity(intent);
  // The original transaction committed both appointment and reminders. A read-only
  // acknowledgement cannot recreate a row deleted between lookup and replay.
  const result: EvaluationActionResult = {
    evaluation_id: intent.id, already_applied: true, messages_created: 0, in_flight: 0,
  };
  completeEvaluationIntent(intent);
  return result;
}

export async function saveEvaluationWithMessages(
  studentId: string, name: string, scheduledAt: Date, notes: string | null,
  evaluationId?: string, allowConflict = false, createIntent?: EvaluationIntent,
): Promise<EvaluationActionResult> {
  const actor = { userId: await evaluationUserId() };
  const intent = evaluationId ? undefined : createIntent ?? await prepareEvaluationIntent(studentId, scheduledAt, notes);
  if (intent) {
    const recovered = await recoverEvaluationCreation(intent, studentId, scheduledAt, notes);
    if (recovered) return recovered;
  }
  const settings = await fetchAutomationSettings();
  const messages = isAutomationEnabled(settings, "evaluation_reminders") ? buildEvaluationMessages(name, scheduledAt) : [];
  await applyLinkedEvaluationTemplates(messages, name, scheduledAt);
  const createId = evaluationId ?? intent!.id;
  await assertEvaluationIdentity(actor);
  if (intent) await assertEvaluationIdentity(intent);
  const { data, error } = await supabase.rpc("mutate_evaluation_tx", {
    _action: evaluationId ? "reschedule" : "create", _evaluation_id: createId,
    _student_id: studentId, _scheduled_at: scheduledAt.toISOString(), _notes: notes,
    _messages: messages.map((message) => ({ ...message })), _allow_conflict: allowConflict,
  });
  if (error) throw error;
  const result = evaluationResult(data);
  if (result.evaluation_id !== createId) throw new Error("Identificador de avaliação divergente");
  if (intent) completeEvaluationIntent(intent);
  return result;
}

export async function finishEvaluationWithMessages(
  evaluationId: string, name: string, outcome: "completed" | "no_show" | "cancel",
): Promise<EvaluationActionResult> {
  const actor = { userId: await evaluationUserId() };
  if (outcome === "cancel") {
    await assertEvaluationIdentity(actor);
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
  await assertEvaluationIdentity(actor);
  const { data, error } = await supabase.rpc("mutate_evaluation_tx", {
    _action: outcome, _evaluation_id: evaluationId, _messages: messages.map(message => ({ ...message })),
  });
  if (error) throw error;
  return evaluationResult(data);
}

export async function checkEvaluationSchedule(studentId: string, scheduledAt: string, ignoreEvaluationId?: string) {
  const { data, error } = await supabase.rpc("evaluation_schedule_conflicts", {
    _student_id: studentId, _scheduled_at: scheduledAt, _ignore_evaluation_id: ignoreEvaluationId,
  });
  if (error) throw error;
  return scheduleConflictResult(data);
}
