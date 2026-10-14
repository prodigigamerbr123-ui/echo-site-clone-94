import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluationDateLabel, evaluationDayLabel } from "@/lib/evaluationAgendaDates";
import { spDate, spDateKey, spIsTomorrow, spStartOfDay } from "@/lib/spTime";
import { useAgendaClock } from "@/hooks/useAgendaClock";
import { useEvaluationAgendaMetrics } from "@/hooks/useEvaluationAgendaMetrics";

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("Brasilia agenda calendar", () => {
  it.each([
    ["2026-10-14T02:59:59Z", "2026-10-13"],
    ["2026-10-14T03:00:00Z", "2026-10-14"],
    ["2027-01-01T02:59:59Z", "2026-12-31"],
  ])("groups %s as %s independently of browser timezone", (value, expected) => {
    expect(spDateKey(new Date(value))).toBe(expected);
    expect(spDateKey(spStartOfDay(new Date(value)))).toBe(expected);
  });
  it.each([[2026, 0, 31], [2026, 11, 31], [2028, 1, 29]])("recognizes tomorrow across month/year boundaries %s/%s/%s", (year, month, day) => {
    const now = spDate(year, month, day, 23, 59);
    const tomorrow = spDate(year, month, day + 1, 0, 0);
    expect(spIsTomorrow(tomorrow, now)).toBe(true);
    expect(evaluationDayLabel(spDateKey(tomorrow), now)).toBe("Amanhã");
  });
  it("labels today and a calendar date in a fixed explicit timezone", () => {
    const now = new Date("2026-10-14T16:00:00Z");
    expect(evaluationDayLabel("2026-10-14", now)).toBe("Hoje");
    expect(evaluationDayLabel("2026-10-16", now)).toMatch(/sexta-feira.*16.*outubro/);
    expect(evaluationDateLabel("2026-01-01T02:59:00Z")).toBe("31/12/2025 23:59");
    expect(evaluationDateLabel("2026-01-01T03:00:00Z", false)).toBe("01/01/2026");
  });
  it("excludes adjacent months from no-show metrics", () => {
    const evaluations = ["2026-10-01T02:59:59Z", "2026-10-01T03:00:00Z", "2026-11-01T02:59:59Z", "2026-11-01T03:00:00Z"]
      .map(scheduled_at => ({ scheduled_at, status: "no_show" }));
    const { result } = renderHook(() => useEvaluationAgendaMetrics(evaluations, Date.parse("2026-10-14T12:00:00Z")));
    expect(result.current.noShowMonth).toBe(2);
  });
  it("refreshes unchanged query data at midnight and on return to a suspended tab", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:59:50Z"));
    const evaluations = [{ scheduled_at: "2026-11-01T03:05:00Z", status: "scheduled" }];
    const { result } = renderHook(() => useEvaluationAgendaMetrics(evaluations, useAgendaClock()));
    expect(result.current.today).toBe(0);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.today).toBe(1);
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(result.current.today).toBe(0);
    expect(result.current.scheduled).toBe(0);
  });
});
