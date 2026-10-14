import { fmtDateISOSP, fmtTimeSP, spDate, spIsToday, spIsTomorrow } from "./spTime";

export function evaluationDateLabel(value: string, includeTime = true) {
  const date = new Date(value);
  const calendar = fmtDateISOSP(date).split("-").reverse().join("/");
  return includeTime ? `${calendar} ${fmtTimeSP(date)}` : calendar;
}

export function evaluationDayLabel(dateKey: string, now = new Date()) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = spDate(year, month - 1, day, 12, 0);
  if (spIsToday(date, now)) return "Hoje";
  if (spIsTomorrow(date, now)) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long",
  }).format(date);
}
