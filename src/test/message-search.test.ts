import { filterScheduledMessages } from "@/components/agendarmensagem/scheduledMessageFilters";
import { filterSentMessages } from "@/components/mensagens/sentMessageFilters";
import { expect, it } from "vitest";

const message = { id: "a", student_id: "student", content: "Avaliação física de acompanhamento", status: "pending", message_type: "manual", created_at: "2026-10-18T15:00:00Z", scheduled_for: "2026-10-20T15:00:00Z", sent_at: "2026-10-18T15:00:00Z", students: { name: "João da Silva", phone: "5543999990000" } };
it.each(["joao", "  JOÃO  DA ", "(43) 99999-0000", "avaliacao   fisica"])("uses the same search for scheduled and sent messages: %s", search => {
  expect(filterScheduledMessages([message], search, "all", {}, [])).toHaveLength(1);
  expect(filterSentMessages([message], search, "all", {})).toHaveLength(1);
});
it("does not hide textual content when the student relation is unavailable", () => {
  const orphan = { ...message, students: undefined };
  expect(filterScheduledMessages([orphan], "avaliacao", "all", {}, [])).toHaveLength(1);
  expect(filterSentMessages([orphan], "avaliacao", "all", {})).toHaveLength(1);
  expect(filterSentMessages([orphan], "joao", "all", {})).toHaveLength(0);
});
it("keeps student and date filters active alongside the normalized search", () => {
  expect(filterScheduledMessages([message], "joao", "all", {}, ["other"])).toHaveLength(0);
  expect(filterSentMessages([message], "joao", "all", {}, ["other"])).toHaveLength(0);
});
