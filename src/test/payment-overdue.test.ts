import { describe, expect, it } from "vitest";
import { countOverdueAttempts, overdueAttemptsExhausted, overdueDaysLabel, overdueDaysPlaceholder } from "../../supabase/functions/_shared/paymentOverdue";

describe("payment overdue collection", () => {
  it("stops after the attempt limit for the same due date and restarts when the date changes", () => {
    const attempts = countOverdueAttempts([
      { student_id: "a", source_payment_due_date: "2026-09-01" },
      { student_id: "a", source_payment_due_date: "2026-09-01" },
      { student_id: "a", source_payment_due_date: "2026-09-01" },
      { student_id: "b", source_payment_due_date: "2026-09-01" },
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
