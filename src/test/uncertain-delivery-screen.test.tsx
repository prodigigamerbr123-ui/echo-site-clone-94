import MessagesList from "@/components/agendarmensagem/MessagesList";
import { hasUncertainDelivery } from "@/lib/messageDeliveryState";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);
const message = { id: "a", student_id: "student", content: "Texto fictício", scheduled_for: "2026-10-19T02:30:00Z", created_at: "2026-10-18T15:00:00Z", status: "failed", message_type: "manual", dispatch_started_at: "2026-10-19T02:30:01Z", students: { name: "Ana", phone: "fixture" } };
function setup(readOnly = false, row = message) {
  render(<MessagesList readOnly={readOnly} messages={[row]} searchTerm="" dateFilter="all" customDateRange={{}} selectedStudents={[]} selectedMessages={[]} onMessageSelect={vi.fn()} onSelectAll={vi.fn()} onDeleteSelected={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onRetry={vi.fn()} onCancelSeries={vi.fn()} />);
}
it("identifies both ambiguous representations without treating every processing message as uncertain", () => {
  expect(hasUncertainDelivery(message)).toBe(true);
  expect(hasUncertainDelivery({ status: "uncertain" })).toBe(true);
  expect(hasUncertainDelivery({ status: "failed", dispatch_started_at: null })).toBe(false);
  expect(hasUncertainDelivery({ status: "processing", dispatch_started_at: "fixture" })).toBe(false);
});
it("preserves ambiguous failures as read-only evidence even in the regular failure list", () => {
  setup();
  expect(screen.getByText("Entrega a conferir")).toBeVisible();
  expect(screen.getByText(/Resultado incerto. Confira no WhatsApp/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Reenviar mensagem" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar mensagem agendada" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar mensagem agendada" })).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
});
it("provides a dedicated view without selection or mutation controls and uses Brasília dates", () => {
  setup(true);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText("18/10/2026")).toBeVisible();
  expect(screen.getByText("23:30 · Brasília")).toBeVisible();
});
it("keeps retry available for a definite provider rejection", () => {
  setup(false, { ...message, dispatch_started_at: "" });
  expect(screen.getByRole("button", { name: "Reenviar mensagem" })).toBeEnabled();
  expect(screen.queryByText("Entrega a conferir")).not.toBeInTheDocument();
});
it("offers a conversation link for checking an uncertain delivery without requeue controls", () => {
  setup(true, { ...message, students: { ...message.students, phone: "43999990000" } });
  expect(screen.getByRole("link", { name: "Abrir conversa no WhatsApp" })).toHaveAttribute("href", "https://wa.me/5543999990000");
  expect(screen.queryByRole("button", { name: "Reenviar mensagem" })).not.toBeInTheDocument();
});
