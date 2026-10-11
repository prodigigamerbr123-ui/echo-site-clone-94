export interface RecurrenceInterval { days: number; count: number }

// Occurrences are materialized once. The delivery worker never extends a series.
export function buildMessageSeries(
  studentId: string,
  content: string,
  scheduledAt: Date,
  intervals: RecurrenceInterval[],
  now = new Date(),
) {
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= now) {
    throw new Error("Data deve ser futura");
  }
  if (!content.trim()) throw new Error("Digite uma mensagem");
  const dates = new Map<number, number>();
  for (const interval of intervals) {
    if (!Number.isInteger(interval.days) || interval.days < 1 || interval.days > 365 ||
        !Number.isInteger(interval.count) || interval.count < 1 || interval.count > 52) {
      throw new Error("Use intervalos de 1 a 365 dias e de 1 a 52 repetições");
    }
    for (let i = 1; i <= interval.count; i++) {
      dates.set(scheduledAt.getTime() + i * interval.days * 86400000, interval.days);
    }
  }
  if (dates.size > 104) throw new Error("Uma série permite até 104 repetições");
  const rootId = crypto.randomUUID();
  const base = {
    student_id: studentId, content: content.trim(), status: "pending",
    recurrence_parent_id: intervals.length ? rootId : null,
    recurrence_count: 1,
  };
  return [
    { ...base, id: rootId, scheduled_for: scheduledAt.toISOString(), message_type: "manual", recurrence_interval_days: null },
    ...Array.from(dates).sort(([a], [b]) => a - b).map(([date, days]) => ({
      ...base, id: crypto.randomUUID(), scheduled_for: new Date(date).toISOString(),
      message_type: "recurring", recurrence_interval_days: days,
    })),
  ];
}
