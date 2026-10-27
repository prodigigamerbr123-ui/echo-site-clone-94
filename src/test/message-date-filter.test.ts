import { filterScheduledMessages } from "@/components/agendarmensagem/scheduledMessageFilters";
import { filterSentMessages } from "@/components/mensagens/sentMessageFilters";
import { messageDateWindow, matchesMessageDate } from "@/lib/messageDateFilter";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-19T01:00:00Z")); });
afterEach(() => vi.useRealTimers());
function row(date: string) {
  return { id: date, student_id: "a", content: "Fixture", status: "sent", message_type: "manual", created_at: date, scheduled_for: date, sent_at: date };
}
function matching(dates: string[], period: string, range: { from?: Date; to?: Date } = {}) {
  const messages = dates.map(row);
  const scheduled = filterScheduledMessages(messages, "", period, range, []).map(message => message.id);
  const sent = filterSentMessages(messages, "", period, range).map(message => message.id);
  expect(sent).toEqual(scheduled);
  return sent;
}
it("uses the whole Brasília day and excludes adjacent days in both lists", () => {
  expect(matching(["2026-10-18T02:59:59.999Z", "2026-10-18T03:00:00Z", "2026-10-19T02:59:59.999Z", "2026-10-19T03:00:00Z"], "today"))
    .toEqual(["2026-10-18T03:00:00Z", "2026-10-19T02:59:59.999Z"]);
});
it("bounds the current month on both sides", () => {
  expect(matching(["2026-10-01T02:59:59Z", "2026-10-01T03:00:00Z", "2026-11-01T02:59:59.999Z", "2026-11-01T03:00:00Z"], "this-month"))
    .toEqual(["2026-10-01T03:00:00Z", "2026-11-01T02:59:59.999Z"]);
});
it("treats a single picker day as one Brasília day, not an open-ended interval", () => {
  expect(matching(["2026-10-18T02:59:59Z", "2026-10-18T03:00:00Z", "2026-10-19T02:59:59.999Z", "2026-10-19T03:00:00Z"], "custom", { from: new Date(2026, 9, 18) }))
    .toEqual(["2026-10-18T03:00:00Z", "2026-10-19T02:59:59.999Z"]);
});
it("includes the last selected day's milliseconds across a year boundary", () => {
  expect(matching(["2026-12-31T03:00:00Z", "2027-01-02T02:59:59.999Z", "2027-01-02T03:00:00Z"], "custom", { from: new Date(2026, 11, 31), to: new Date(2027, 0, 1) }))
    .toEqual(["2026-12-31T03:00:00Z", "2027-01-02T02:59:59.999Z"]);
});
it("handles February's last day in a leap year", () => {
  expect(matching(["2028-02-29T03:00:00Z", "2028-03-01T02:59:59.999Z", "2028-03-01T03:00:00Z"], "custom", { from: new Date(2028, 1, 29) }))
    .toEqual(["2028-02-29T03:00:00Z", "2028-03-01T02:59:59.999Z"]);
});
it("does not apply a custom range until a day is selected", () => {
  expect(matching(["2026-10-18T15:00:00Z"], "custom")).toHaveLength(1);
});
it("does not match invalid or inverted date windows", () => {
  for (const range of [{ from: new Date(NaN) }, { from: new Date(2026, 9, 19), to: new Date(2026, 9, 18) }]) {
    expect(matching(["2026-10-18T15:00:00Z"], "custom", range)).toEqual([]);
  }
  expect(matchesMessageDate("infinity", messageDateWindow("today", {}))).toBe(false);
});
