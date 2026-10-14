import { describe, expect, it } from "vitest";
import { deliverySpread, parseScheduleDate, planMessageBatch } from "@/lib/messageSchedule";

const now = new Date("2026-10-14T02:30:00Z"); // Still October 13 in Brasilia.
const students = [{ id: "one", name: "Ana" }, { id: "two", name: "Bia" }];
const quick = { kind: "quick" as const, when: "today" as const, repeat: false,
  days: { days7: false, days21: false, days45: false }, time: "23:45" };

describe("shared message planner", () => {
  it("personalizes every recipient and schedules today in Brasilia", () => {
    const rows = planMessageBatch(students, "  Olá {NOME}  ", quick, now);
    expect(rows.map(row => row.content)).toEqual(["Olá Ana", "Olá Bia"]);
    expect(rows.every(row => row.scheduled_for === "2026-10-14T02:45:00.000Z")).toBe(true);
    expect(rows.every(row => row.status === "pending" && row.message_type === "manual")).toBe(true);
  });
  it("supports today's message plus selected follow-ups across month boundaries", () => {
    const rows = planMessageBatch([students[0]], "Oi", { ...quick, repeat: true,
      days: { days7: true, days21: true, days45: true } }, now);
    expect(rows.map(row => row.message_type)).toEqual(["manual", "7_day_followup", "21_day_followup", "45_day_followup"]);
    expect(rows[2].scheduled_for).toBe("2026-11-04T02:45:00.000Z");
  });
  it("ignores stale repeat options when today has repeat disabled", () => {
    expect(planMessageBatch([students[0]], "Oi", { ...quick, days: { days7: true, days21: true, days45: true } }, now)).toHaveLength(1);
  });
  it("does not include today when later is selected", () => {
    const rows = planMessageBatch([students[0]], "Oi", { ...quick, when: "later", days: { days7: true, days21: false, days45: false } }, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].message_type).toBe("7_day_followup");
  });
  it("rejects an empty later selection", () => {
    expect(() => planMessageBatch(students, "Oi", { ...quick, when: "later" }, now)).toThrow("Selecione pelo menos uma opção");
  });
  it("rejects elapsed or current times before creating any rows", () => {
    for (const time of ["23:29", "23:30"]) {
      expect(() => planMessageBatch(students, "Oi", { ...quick, time }, now)).toThrow("já passou");
    }
  });
  it("materializes independent recurrence roots per student and deduplicates overlapping dates", () => {
    const rows = planMessageBatch(students, "Oi {nome}", { kind: "custom", date: "2026-10-20", time: "10:00",
      intervals: [{ days: 7, count: 4 }, { days: 14, count: 2 }] }, now);
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map(row => row.id)).size).toBe(10);
    expect(new Set(rows.map(row => row.recurrence_parent_id)).size).toBe(2);
  });
  it("rejects empty, duplicate or missing recipient selections", () => {
    expect(() => planMessageBatch([], "Oi", quick, now)).toThrow("aluno");
    expect(() => planMessageBatch([students[0], students[0]], "Oi", quick, now)).toThrow("duplicados");
  });
  it("checks content limits after trimming and personalization", () => {
    for (const content of ["   ", "x".repeat(1001)]) {
      expect(() => planMessageBatch(students, content, quick, now)).toThrow("1000");
    }
    expect(() => planMessageBatch([{ id: "a", name: "a".repeat(20) }], "x".repeat(990) + "{nome}", quick, now)).toThrow("personalizada");
  });
  it("applies the same gradual delivery window used by the UI", () => {
    const recipients = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: "Ana" }));
    const rows = planMessageBatch(recipients, "Oi", { kind: "now" }, now, () => 0);
    expect(deliverySpread(10)).toEqual({ spread: true, minutes: 20 });
    expect(Date.parse(rows[9].scheduled_for) - Date.parse(rows[0].scheduled_for)).toBe(20 * 60_000);
    expect(Date.parse(rows[0].scheduled_for)).toBe(now.getTime() + 60_000);
    expect(deliverySpread(5).spread).toBe(false);
    expect(deliverySpread(100).minutes).toBe(60);
    expect(deliverySpread(101).minutes).toBe(61);
  });
});

describe("calendar inputs", () => {
  it.each([["2026-02-31", "10:00"], ["2026-02-29", "10:00"], ["2026-13-01", "10:00"],
    ["2026-00-01", "10:00"], ["0099-01-01", "10:00"], ["2026-10-20", "24:00"],
    ["2026-10-20", "09:60"], ["2026-10-20", "9:00"], ["", "10:00"]])("rejects %s %s", (date, time) => {
    expect(() => parseScheduleDate(date, time)).toThrow();
  });
  it("accepts leap dates and midnight without browser timezone conversion", () => {
    expect(parseScheduleDate("2028-02-29", "00:00").toISOString()).toBe("2028-02-29T03:00:00.000Z");
  });
});
