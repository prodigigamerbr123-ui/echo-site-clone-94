// Helpers de horário de Brasília (UTC-3, sem DST) para uso no frontend.
// Paridade EXATA com supabase/functions/_shared/evaluations.ts — não altere
// um lado sem alterar o outro. Existe para garantir que o cálculo de
// horários das mensagens automáticas não dependa do fuso do navegador.

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
