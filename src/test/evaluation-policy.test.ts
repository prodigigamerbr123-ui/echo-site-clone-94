import { describe, expect, it, vi, afterEach } from "vitest";
import { buildEvaluationMessages, planEvaluationFollowup } from "../../supabase/functions/_shared/evaluationPolicy";

const now = new Date("2026-10-13T12:00:00Z");
afterEach(() => vi.restoreAllMocks());

describe("shared evaluation policy", () => {
  it("creates confirmation and both well-separated reminders", () => {
    const rows = buildEvaluationMessages("Ana", new Date("2026-10-15T18:00:00Z"), now);
    expect(rows.map(row => row.scheduled_for)).toEqual([
      "2026-10-13T12:02:00.000Z", "2026-10-14T21:00:00.000Z", "2026-10-15T15:00:00.000Z",
    ]);
    expect(rows.every(row => row.content.includes("Ana"))).toBe(true);
  });
  it("drops the eve reminder when the next one is less than 12 hours later", () => {
    const rows = buildEvaluationMessages("Ana", new Date("2026-10-15T11:00:00Z"), now);
    expect(rows.map(row => row.message_type)).toEqual(["evaluation_confirmation", "evaluation_reminder_day"]);
  });
  it("preserves the boundary at exactly twelve hours", () => {
    expect(buildEvaluationMessages("Ana", new Date("2026-10-15T12:00:00Z"), now)).toHaveLength(3);
  });
  it("omits expired reminders and handles year boundaries in Brasilia", () => {
    const rows = buildEvaluationMessages("Ana", new Date("2027-01-01T18:00:00Z"), new Date("2026-12-31T22:00:00Z"));
    expect(rows.map(row => row.message_type)).toEqual(["evaluation_confirmation", "evaluation_reminder_day"]);
  });
  it.each(["invalid", "2026-10-13T11:00:00Z", "2026-10-13T12:00:00Z"])("rejects invalid or elapsed appointment %s", value => {
    expect(() => buildEvaluationMessages("Ana", new Date(value), now)).toThrow("futura");
  });
  it("schedules follow-up from completion day with the configured delay", () => {
    const row = planEvaluationFollowup("Ana", "completed", 14, now, () => 0);
    expect(row.scheduled_for).toBe("2026-10-27T12:00:00.000Z");
    expect(row.message_type).toBe("evaluation_followup");
  });
  it("schedules no-show for tomorrow within the 09:00-11:59 gym window", () => {
    const row = planEvaluationFollowup("Ana", "no_show", 100, now, () => 0.999);
    expect(row.scheduled_for).toBe("2026-10-14T14:59:00.000Z");
    expect(row.message_type).toBe("evaluation_reschedule");
  });
  it.each([0, -1, 366, 1.5, NaN])("rejects invalid follow-up delay %s", days => {
    expect(() => planEvaluationFollowup("Ana", "completed", days, now)).toThrow("inválido");
  });
});
