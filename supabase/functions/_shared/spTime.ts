// Current gym timezone: Brasilia (UTC-3). Calendar arithmetic is independent of runtime timezone.

export const SP_OFFSET_MS = -3 * 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function spParts(d: Date) {
  const s = new Date(d.getTime() + SP_OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    mo: s.getUTCMonth(),
    d: s.getUTCDate(),
    h: s.getUTCHours(),
    mi: s.getUTCMinutes(),
  };
}

/** Constrói um Date UTC que representa (y-mo-d h:mi) no horário SP. */
export function spDate(y: number, mo: number, d: number, h: number, mi: number) {
  return new Date(Date.UTC(y, mo, d, h, mi) - SP_OFFSET_MS);
}

export function fmtDateSP(d: Date) {
  const p = spParts(d);
  return `${pad(p.d)}/${pad(p.mo + 1)}`;
}

export function fmtTimeSP(d: Date) {
  const p = spParts(d);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

export function fmtDateISOSP(d: Date) {
  const p = spParts(d);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`;
}

export function spDateKey(d: Date) {
  return fmtDateISOSP(d);
}

export function spStartOfDay(d = new Date()) {
  const p = spParts(d);
  return spDate(p.y, p.mo, p.d, 0, 0);
}

export function spIsToday(d: Date, now = new Date()) {
  return spDateKey(d) === spDateKey(now);
}

export function spIsTomorrow(d: Date, now = new Date()) {
  const p = spParts(now);
  const tomorrow = spDate(p.y, p.mo, p.d + 1, 12, 0);
  return spDateKey(d) === spDateKey(tomorrow);
}
