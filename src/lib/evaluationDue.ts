import type { Tables } from "@/integrations/supabase/types";

export const DEFAULT_EVALUATION_DAYS_OVERDUE = 90;

export function evaluationDaysOverdue(value: unknown): number {
  if (value === undefined) return DEFAULT_EVALUATION_DAYS_OVERDUE;
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())) {
    throw new Error("Confira o prazo de avaliação nas automações.");
  }
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) throw new Error("Confira o prazo de avaliação nas automações.");
  return days;
}

export function elapsedEvaluationDays(reference: string, now: number): number {
  return (now - new Date(reference).getTime()) / 86400000;
}

/** Same elapsed-time boundaries as daily-automation; no browser timezone arithmetic. */
export function needsEvaluation(
  student: Pick<Tables<"students">, "status" | "had_evaluation" | "last_evaluation_date" | "created_at">,
  daysOverdue: number,
  hasFutureEvaluation: boolean,
  now: number,
): boolean {
  if (student.status !== "active" || hasFutureEvaluation) return false;
  if (student.last_evaluation_date) return elapsedEvaluationDays(student.last_evaluation_date, now) > daysOverdue;
  return !student.had_evaluation && elapsedEvaluationDays(student.created_at, now) > 14;
}
