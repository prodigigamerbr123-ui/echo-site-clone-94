import { fmtDateISOSP } from "@/lib/spTime";

const MONTHS_BY_PLAN: Record<string, number> = {
  Mensal: 1,
  Trimestral: 3,
  Quadrimestral: 4,
  Semestral: 6,
  Octomestral: 8,
  Anual: 12,
  "12 meses": 12,
};

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || month < 1 || month > 12) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= lastDay;
}

function addCalendarMonthsClamped(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const newYear = target.getUTCFullYear();
  const newMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Suggest the next due date; discounted legacy labels have no known duration. */
export function suggestedRenewalDate(plan: string, currentDue: string | null, today = fmtDateISOSP(new Date())): string | null {
  const months = MONTHS_BY_PLAN[plan];
  if (!months || !validCalendarDate(today)) return null;
  const anchor = currentDue && validCalendarDate(currentDue) && currentDue > today ? currentDue : today;
  return addCalendarMonthsClamped(anchor, months);
}
