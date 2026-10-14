import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database, Json } from "./database.types.ts";
import { evaluationResult } from "./contracts.ts";
import { resolveAutomationMessage } from "./messageTemplates.ts";
import { fmtDateSP, fmtTimeSP } from "./spTime.ts";
import { buildEvaluationMessages, planEvaluationFollowup } from "./evaluationPolicy.ts";
export { buildEvaluationMessages } from "./evaluationPolicy.ts";
export type { EvaluationMessage as EvaluationAutoMessage } from "./evaluationPolicy.ts";

export const AUTO_EVAL_MESSAGE_TYPES = [
  "evaluation_confirmation",
  "evaluation_reminder_1d",
  "evaluation_reminder_day",
  "evaluation_followup",
  "evaluation_reschedule",
  "evaluation_reminder",
  "birthday",
  "welcome",
  "reengagement",
] as const;

// -------- Automation settings helpers --------

export type AutomationSettingsMap = Record<
  string,
  { enabled: boolean; params: Record<string, Json | undefined> }
>;

export async function loadAutomationSettings(
  supabase: SupabaseClient<Database>,
): Promise<AutomationSettingsMap> {
  const { data, error } = await supabase
    .from("automation_settings")
    .select("key, enabled, params");
  if (error) throw error;
  const map: AutomationSettingsMap = {};
  for (const r of data ?? []) {
    map[r.key] = { enabled: !!r.enabled, params: r.params && typeof r.params === "object" && !Array.isArray(r.params) ? r.params : {} };
  }
  return map;
}
export function settingEnabled(map: AutomationSettingsMap, key: string): boolean {
  // Alinhado com o frontend (isAutomationEnabled): sem linha == desligado.
  const s = map[key];
  return s ? s.enabled : false;
}
export function settingParam<T>(
  map: AutomationSettingsMap,
  key: string,
  name: string,
  fallback: T,
): T {
  const v = map[key]?.params?.[name];
  return (v === undefined || v === null ? fallback : v) as T;
}

// -------- Travas de pré-agendamento --------

export interface ScheduleConflictCheck {
  duplicate?: {
    evaluation_id: string;
    scheduled_at: string;
  };
  conflict?: {
    evaluation_id: string;
    student_name: string;
    scheduled_at: string;
  };
}

export async function checkScheduleConflicts(
  supabase: SupabaseClient<Database>,
  studentId: string,
  scheduledAt: Date,
): Promise<ScheduleConflictCheck> {
  // Meia-noite de "hoje" em America/Sao_Paulo (UTC-3), não UTC do runtime
  const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
  const nowSp = new Date(Date.now() + SP_OFFSET_MS);
  const startOfToday = new Date(
    Date.UTC(nowSp.getUTCFullYear(), nowSp.getUTCMonth(), nowSp.getUTCDate(), 0, 0) - SP_OFFSET_MS,
  );

  const { data: futureEvals, error } = await supabase
    .from("evaluations")
    .select("id, student_id, scheduled_at, students(name)")
    .eq("status", "scheduled")
    .gte("scheduled_at", startOfToday.toISOString());

  if (error) throw error;
  const res: ScheduleConflictCheck = {};
  const target = scheduledAt.getTime();

  for (const ev of futureEvals || []) {
    if (ev.student_id === studentId) {
      // Preserva a duplicata mais antiga (menor scheduled_at) para mensagem consistente
      if (!res.duplicate || new Date(ev.scheduled_at).getTime() < new Date(res.duplicate.scheduled_at).getTime()) {
        res.duplicate = { evaluation_id: ev.id, scheduled_at: ev.scheduled_at };
      }
    }
    const d = new Date(ev.scheduled_at).getTime();
    if (Math.abs(d - target) < 30 * 60 * 1000 && ev.student_id !== studentId) {
      res.conflict = {
        evaluation_id: ev.id,
        student_name: ev.students?.name ?? "outro aluno",
        scheduled_at: ev.scheduled_at,
      };
    }
  }
  return res;
}

// -------- Ações principais --------

export async function createEvaluationWithMessages(
  supabase: SupabaseClient<Database>,
  studentId: string,
  scheduledAt: Date,
  notes: string | null,
): Promise<{ evaluation_id: string; messages_created: number }> {
  const { data: student, error: sErr } = await supabase
    .from("students").select("id, name").eq("id", studentId).single();
  if (sErr || !student) throw new Error("Aluno não encontrado");

  const settings = await loadAutomationSettings(supabase);
  const auto = settingEnabled(settings, "evaluation_reminders") ? buildEvaluationMessages(student.name, scheduledAt) : [];
  const vars = { nome: student.name, data: fmtDateSP(scheduledAt), hora: fmtTimeSP(scheduledAt) };
  for (const m of auto) {
    m.content = await resolveAutomationMessage(supabase, settings, "evaluation_reminders", m.message_type, m.content, vars);
  }
  const { data, error } = await supabase.rpc("mutate_evaluation_tx", {
    _action: "create", _evaluation_id: crypto.randomUUID(), _student_id: studentId,
    _scheduled_at: scheduledAt.toISOString(), _notes: notes ?? undefined, _messages: auto.map(message => ({ ...message })),
  });
  if (error) throw error;
  return evaluationResult(data);
}

async function finishEvaluationOutcome(supabase: SupabaseClient<Database>, evaluationId: string, outcome: "completed" | "no_show") {
  const { data: ev, error } = await supabase.from("evaluations")
    .select("id, student_id, students(name)").eq("id", evaluationId).single();
  if (error || !ev) throw new Error("Avaliação não encontrada");
  const settings = await loadAutomationSettings(supabase);
  const key = outcome === "completed" ? "evaluation_followup" : "no_show_reschedule";
  const messages = [];
  if (settingEnabled(settings, key)) {
    const days = outcome === "completed" ? Number(settingParam(settings, key, "days_after", 7)) : 1;
    const name = ev.students?.name ?? "aluno";
    const message = planEvaluationFollowup(name, outcome, days);
    message.content = await resolveAutomationMessage(supabase, settings, key, message.message_type, message.content, { nome: name });
    messages.push(message);
  }
  const { data, error: actionError } = await supabase.rpc("mutate_evaluation_tx", {
    _action: outcome, _evaluation_id: evaluationId, _messages: messages.map(message => ({ ...message })),
  });
  if (actionError) throw actionError;
  return evaluationResult(data);
}

export async function completeEvaluation(supabase: SupabaseClient<Database>, evaluationId: string): Promise<{ followup_scheduled: boolean }> {
  const result = await finishEvaluationOutcome(supabase, evaluationId, "completed");
  return { followup_scheduled: result.messages_created > 0 };
}

export async function noShowEvaluation(supabase: SupabaseClient<Database>, evaluationId: string): Promise<void> {
  await finishEvaluationOutcome(supabase, evaluationId, "no_show");
}
