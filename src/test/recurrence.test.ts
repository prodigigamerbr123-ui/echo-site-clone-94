import { describe, expect, it } from "vitest";
import { buildMessageSeries } from "@/lib/recurrence";

const now = new Date("2026-10-11T12:00:00Z");
const when = new Date("2026-10-12T12:00:00Z");
describe("materialized message series", () => {
  it("creates exactly five occurrences for an initial message and four weekly repeats", () => {
    const rows = buildMessageSeries("student", "Olá", when, [{ days: 7, count: 4 }], now);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.id)).size).toBe(5);
    expect(rows.map((row) => row.scheduled_for)).toEqual([0, 7, 14, 21, 28].map((days) => new Date(when.getTime() + days * 86400000).toISOString()));
    expect(rows.every((row) => row.recurrence_count === 1)).toBe(true);
    expect(rows.every((row) => row.recurrence_parent_id === rows[0].id)).toBe(true);
  });
  it("deduplicates overlapping intervals", () => {
    expect(buildMessageSeries("student", "Olá", when, [{ days: 7, count: 4 }, { days: 14, count: 2 }], now)).toHaveLength(5);
  });
  it.each([{ days: 0, count: 4 }, { days: 7, count: 0 }, { days: 7, count: 53 }, { days: 7, count: 1.5 }])("rejects invalid repetition %j", (interval) => {
    expect(() => buildMessageSeries("student", "Olá", when, [interval], now)).toThrow();
  });
  it("rejects expired or invalid dates", () => {
    expect(() => buildMessageSeries("student", "Olá", now, [], now)).toThrow();
    expect(() => buildMessageSeries("student", "Olá", new Date("invalid"), [], now)).toThrow();
  });
});
