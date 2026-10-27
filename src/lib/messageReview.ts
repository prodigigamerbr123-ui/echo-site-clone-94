import type { Student } from "@/lib/messageRecipients";
import { formatPhoneBR, replaceNameVar } from "@/lib/phone";
import { deliverySpread, planMessageBatch, type MessageSchedule } from "@/lib/messageSchedule";

export function buildMessageReview(recipients: Student[], content: string, schedule: MessageSchedule, now = new Date()) {
  if (!recipients.length || recipients.length > 500) throw new Error("Selecione de 1 a 500 alunos");
  if (new Set(recipients.map(student => student.id)).size !== recipients.length) throw new Error("Há alunos repetidos na seleção");
  if (schedule.kind === "custom" && schedule.intervals.length > 20) throw new Error("Use no máximo 20 intervalos");
  const phones = new Map<string, string[]>();
  for (const student of recipients) {
    if (student.messages_enabled === false) throw new Error(`${student.name} está com mensagens desativadas`);
    const phone = formatPhoneBR(student.phone);
    if (!phone.ok) throw new Error(`Confira o telefone de ${student.name} antes de enviar`);
    if (replaceNameVar(content.trim(), student.name).length > 1000) throw new Error(`A mensagem personalizada de ${student.name} ultrapassa 1000 caracteres`);
    phones.set(phone.number, [...(phones.get(phone.number) ?? []), student.name]);
  }
  // Dates are a review estimate. The server creates IDs, checks dates and authorizes the write.
  const occurrences = planMessageBatch([recipients[0]], content, schedule, now, () => 0);
  const total = occurrences.length * recipients.length;
  if (total > 5000) throw new Error("O lote ultrapassa o limite de 5000 mensagens");
  return {
    recipients: recipients.map(student => ({ ...student })), message: content.trim(),
    schedule: structuredClone(schedule), total, perStudent: occurrences.length,
    dates: occurrences.map(row => row.scheduled_for),
    sharedPhones: [...phones.values()].filter(names => names.length > 1),
    inactive: recipients.filter(student => student.status === "inactive").length,
    spread: deliverySpread(recipients.length),
  };
}

export type MessageReview = ReturnType<typeof buildMessageReview>;

export function reviewRecipientsUnchanged(review: MessageReview, students: Student[]): boolean {
  return review.recipients.every(previous => {
    const current = students.find(student => student.id === previous.id);
    return current && current.name === previous.name && current.phone === previous.phone &&
      current.messages_enabled === previous.messages_enabled && current.status === previous.status;
  });
}
