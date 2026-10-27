import { fmtDateISOSP } from "@/lib/spTime";

export function validPerformedDate(value: string, now = new Date()): boolean {
  if (!/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && value <= fmtDateISOSP(now);
}

export function performedDateLabel(value: string): string {
  return value.split("-").reverse().join("/");
}
