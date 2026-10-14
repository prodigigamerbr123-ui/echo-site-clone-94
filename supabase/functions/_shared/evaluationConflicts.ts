import { record } from "./contracts.ts";

export interface ScheduleConflictCheck {
  duplicate?: { evaluation_id: string; scheduled_at: string };
  conflict?: { evaluation_id: string; scheduled_at: string; student_name: string };
}

/** Invalid/missing data must not be interpreted as an empty agenda. */
export function scheduleConflictResult(value: unknown): ScheduleConflictCheck {
  const data = record(value);
  if (!("duplicate" in data) || !("conflict" in data)) throw new Error("Consulta de agenda inválida");
  const parse = (entry: unknown) => {
    const item = record(entry);
    if (typeof item.evaluation_id !== "string" || typeof item.scheduled_at !== "string" ||
        !Number.isFinite(Date.parse(item.scheduled_at))) throw new Error("Consulta de agenda inválida");
    return { evaluation_id: item.evaluation_id, scheduled_at: item.scheduled_at };
  };
  const result: ScheduleConflictCheck = {};
  if (data.duplicate !== null) result.duplicate = parse(data.duplicate);
  if (data.conflict !== null) {
    const item = record(data.conflict);
    if (typeof item.student_name !== "string") throw new Error("Consulta de agenda inválida");
    result.conflict = { ...parse(item), student_name: item.student_name };
  }
  return result;
}
