import { spDate, spParts } from "@/lib/spTime";

export interface MessageDateRange { from?: Date; to?: Date }
export type MessageDateWindow = { from: number; until: number } | null;

/** Calendar pickers expose local Date objects representing the day the user chose. */
export function messageDateWindow(filter: string, range: MessageDateRange, now = new Date()): MessageDateWindow {
  if (filter === "today" || filter === "this-month") {
    const day = spParts(now);
    return filter === "today"
      ? { from: spDate(day.y, day.mo, day.d, 0, 0).getTime(), until: spDate(day.y, day.mo, day.d + 1, 0, 0).getTime() }
      : { from: spDate(day.y, day.mo, 1, 0, 0).getTime(), until: spDate(day.y, day.mo + 1, 1, 0, 0).getTime() };
  }
  if (filter !== "custom" || !range.from) return null;
  const first = range.from;
  const last = range.to ?? first;
  const from = spDate(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0).getTime();
  const finalDay = spDate(last.getFullYear(), last.getMonth(), last.getDate(), 0, 0).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(finalDay) || finalDay < from) return { from: NaN, until: NaN };
  return { from, until: spDate(last.getFullYear(), last.getMonth(), last.getDate() + 1, 0, 0).getTime() };
}

export function matchesMessageDate(value: string, window: MessageDateWindow): boolean {
  if (!window) return true;
  const timestamp = Date.parse(value);
  return timestamp >= window.from && timestamp < window.until;
}
