import { describe, expect, it } from "vitest";
import { countOverdueAttempts, overdueAttemptsExhausted, overdueDaysLabel, overdueDaysPlaceholder, readOverdueParams } from "../../supabase/functions/_shared/paymentOverdue";

describe("payment overdue collection", () => {
  it("stops after the attempt limit for the same due date and restarts when the date changes", () => {
    const attempts = countOverdueAttempts([
      { status: "sent", dispatch_started_at: null, student_id: "a", source_payment_due_date: "2026-09-01" },
      { status: "sent", dispatch_started_at: null, student_id: "a", source_payment_due_date: "2026-09-01" },
      { status: "sent", dispatch_started_at: null, student_id: "a", source_payment_due_date: "2026-09-01" },
      { status: "sent", dispatch_started_at: null, student_id: "b", source_payment_due_date: "2026-09-01" },
    ]);
    expect(overdueAttemptsExhausted(attempts, "a", "2026-09-01", 3)).toBe(true);
    expect(overdueAttemptsExhausted(attempts, "a", "2026-10-01", 3)).toBe(false);
    expect(overdueAttemptsExhausted(attempts, "b", "2026-09-01", 3)).toBe(false);
  });

  it("does not state an exact delay when the stored date may be stale", () => {
    expect(overdueDaysLabel(1)).toBe("1 dia");
    expect(overdueDaysLabel(30)).toBe("30 dias");
    expect(overdueDaysLabel(96)).toBe("mais de 30 dias");
    expect(overdueDaysPlaceholder(12)).toBe("12");
    expect(overdueDaysPlaceholder(96)).toBe("mais de 30");
  });
});

it("counts ambiguous dispatch failures but excludes confirmed failures and cancellations", () => {
  const row = { student_id: "a", source_payment_due_date: "2026-10-01", dispatch_started_at: null };
  const attempts = countOverdueAttempts([
    { ...row, status: "failed", dispatch_started_at: "2026-10-02T12:00:00Z" },
    { ...row, status: "failed" },
    { ...row, status: "cancelled" },
    { ...row, status: "uncertain" },
    { ...row, status: "pending" },
  ]);
  expect(overdueAttemptsExhausted(attempts, "a", "2026-10-01", 3)).toBe(true);
  expect(attempts.get("a:2026-10-01")).toBe(3);
});

it("uses legacy defaults and accepts integer form values", () => {
  expect(readOverdueParams({})).toEqual({ days_after_due: 1, repeat_every_days: 7, max_attempts: 3 });
  expect(readOverdueParams({ max_attempts: "5" }).max_attempts).toBe(5);
});

it.each([3.5, -1, 0, "", " ", "abc", NaN, Infinity, null, true, [], {}])("rejects invalid attempt limit %j", value => {
  expect(() => readOverdueParams({ max_attempts: value })).toThrow("inteiro");
});
