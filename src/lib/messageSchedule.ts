import type { Database } from "@/integrations/supabase/types";
import { replaceNameVar } from "@/lib/phone";
import { buildMessageSeries, type RecurrenceInterval } from "@/lib/recurrence";
import { fmtDateISOSP, spDate, spParts } from "@/lib/spTime";

export type MessageSchedule =
  | { kind: "now" }
  | { kind: "quick"; when: "today" | "later"; repeat: boolean;
      days: { days7: boolean; days21: boolean; days45: boolean }; time: string }
  | { kind: "custom"; date: string; time: string; intervals: RecurrenceInterval[] };

type MessageRow = Database["public"]["Tables"]["scheduled_messages"]["Insert"];
type Recipient = { id: string; name: string };

export function deliverySpread(count: number) {
  if (count <= 5) return { spread: false, minutes: 0 };
  if (count <= 20) return { spread: true, minutes: Math.min(30, count * 2) };
  if (count <= 100) return { spread: true, minutes: 60 };
  return { spread: true, minutes: Math.ceil(count * 0.6) };
}

/** Validate before constructing Date: JavaScript silently normalizes 31/02 and 24:00. */
export function parseScheduleDate(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horário inválido");
  const [year, month, day] = date.split("-").map(Number);
  if (year < 1000) throw new Error("Data inválida");
  const [hour, minute] = time.split(":").map(Number);
  const result = spDate(year, month - 1, day, hour, minute);
  const parts = spParts(result);
  if (parts.y !== year || parts.mo !== month - 1 || parts.d !== day) throw new Error("Data inválida");
  return result;
}

/** One planner for both composers; persistence and authorization remain separate. */
export function planMessageBatch(
  recipients: Recipient[], message: string, schedule: MessageSchedule,
  now = new Date(), random = Math.random,
): MessageRow[] {
  const content = message.trim();
  if (!recipients.length) throw new Error("Selecione pelo menos um aluno");
  if (new Set(recipients.map((student) => student.id)).size !== recipients.length) {
    throw new Error("Há alunos duplicados na seleção");
  }
  if (!content || content.length > 1000) throw new Error("Informe uma mensagem de até 1000 caracteres");
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida");
  const personalized = recipients.map((student) => ({
    ...student, content: replaceNameVar(content, student.name),
  }));
  // Personalization may itself expand a template beyond the message limit.
  if (personalized.some((student) => student.content.length > 1000)) {
    throw new Error("A mensagem personalizada ultrapassa 1000 caracteres");
  }
  if (schedule.kind === "now") {
    const span = deliverySpread(recipients.length).minutes * 60_000;
    return personalized.map((student, index) => ({
      student_id: student.id, content: student.content, status: "pending", message_type: "manual",
      scheduled_for: new Date(now.getTime() + 60_000 + Math.floor(random() * 120_000) +
        (span ? Math.floor(span * index / (recipients.length - 1)) + Math.floor(random() * 20_000) : 0)).toISOString(),
    }));
  }
  if (schedule.kind === "custom") {
    const base = parseScheduleDate(schedule.date, schedule.time);
    return personalized.flatMap((student) =>
      buildMessageSeries(student.id, student.content, base, schedule.intervals, now));
  }
  const offsets: [number, string][] = [];
  if (schedule.when === "today") offsets.push([0, "manual"]);
  if (schedule.when === "later" || schedule.repeat) {
    if (schedule.days.days7) offsets.push([7, "7_day_followup"]);
    if (schedule.days.days21) offsets.push([21, "21_day_followup"]);
    if (schedule.days.days45) offsets.push([45, "45_day_followup"]);
  }
  if (!offsets.length) throw new Error("Selecione pelo menos uma opção de envio");
  const dates = offsets.map(([days, type]) => {
    const date = fmtDateISOSP(new Date(now.getTime() + days * 86_400_000));
    const when = parseScheduleDate(date, schedule.time);
    if (when <= now) throw new Error("O horário de hoje já passou");
    return { type, when: when.toISOString() };
  });
  return personalized.flatMap((student) => dates.map(({ type, when }) => ({
    student_id: student.id, content: student.content,
    scheduled_for: when, message_type: type, status: "pending",
  })));
}
