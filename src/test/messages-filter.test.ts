import { describe, expect, it } from "vitest";
import { filterScheduledMessages } from "@/components/agendarmensagem/MessagesList";

const messages = [
  {
    id: "a",
    content: "Lembrete de mensalidade",
    scheduled_for: "2026-10-06T15:00:00.000Z",
    status: "pending",
    message_type: "payment_reminder_due",
    created_at: "2026-10-06T12:00:00.000Z",
    student_id: "student-a",
    students: { name: "Ana Silva", phone: "43999999999" },
  },
  {
    id: "b",
    content: "Avaliação física",
    scheduled_for: "2026-10-07T15:00:00.000Z",
    status: "pending",
    message_type: "evaluation_reminder",
    created_at: "2026-10-06T12:00:00.000Z",
    student_id: "student-b",
    students: { name: "Bruno Souza", phone: "43888888888" },
  },
];

describe("filterScheduledMessages", () => {
  it("combines text and student filters", () => {
    const filtered = filterScheduledMessages(
      messages,
      "mensalidade",
      "all",
      {},
      ["student-a"],
    );

    expect(filtered.map((message) => message.id)).toEqual(["a"]);
  });

  it("does not return a message from a different selected student", () => {
    const filtered = filterScheduledMessages(
      messages,
      "mensalidade",
      "all",
      {},
      ["student-b"],
    );

    expect(filtered).toEqual([]);
  });
});
