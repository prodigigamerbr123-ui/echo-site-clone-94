import { EvaluationOutcomeDialog } from "@/components/avaliacoes/EvaluationOutcomeDialog";
import type { AgendaEvaluation } from "@/components/avaliacoes/agendaTypes";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const now = Date.parse("2026-10-18T15:00:00Z");
const evaluation: AgendaEvaluation = { id: "eval-1", student_id: "student-1", scheduled_at: "2026-10-17T12:00:00Z", status: "scheduled", notes: null, completed_at: null, students: { name: "Ana", phone: "fixture" } };
const settings = {
  evaluation_followup: { key: "evaluation_followup", enabled: true, params: { days_after: 7 } },
  no_show_reschedule: { key: "no_show_reschedule", enabled: true, params: {} },
};
afterEach(cleanup);
function props() {
  return { evaluation, outcome: "completed" as const, now, settings, settingsUnavailable: false, saving: false, error: null, onClose: vi.fn(), onConfirm: vi.fn() };
}
describe("evaluation outcome review", () => {
  it("requires a real date on old appointments and does not infer it from the booking", () => {
    render(<EvaluationOutcomeDialog {...props()} />);
    expect(screen.getByLabelText("Data real do atendimento *")).toHaveValue("");
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi que este resultado/ }));
    expect(screen.getByRole("button", { name: "Registrar avaliação realizada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByLabelText("Data real do atendimento *")).toHaveValue("2026-10-18");
    expect(screen.getByRole("checkbox", { name: /Conferi que este resultado/ })).not.toBeChecked();
  });
  it("requires a fresh review when changing the actual day of a same-day appointment", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} evaluation={{ ...evaluation, scheduled_at: "2026-10-18T12:00:00Z" }} />);
    fireEvent.change(screen.getByLabelText("Data real do atendimento *"), { target: { value: "2026-10-16" } });
    expect(screen.getByRole("button", { name: "Registrar avaliação realizada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi que este resultado/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar avaliação realizada" }));
    expect(data.onConfirm).toHaveBeenCalledWith(true, "2026-10-16");
  });
  it("saves without a message when the student has disabled contact", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} messagesAllowed={false} evaluation={{ ...evaluation, scheduled_at: "2026-10-18T12:00:00Z" }} />);
    expect(screen.getByRole("checkbox", { name: /mensagem automática de acompanhamento/ })).toBeDisabled();
    expect(screen.getByText(/O aluno está com mensagens desativadas/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Registrar avaliação realizada" }));
    expect(data.onConfirm).toHaveBeenCalledWith(false, "2026-10-18");
  });
  it("requires date review for an old appointment and defaults to no message", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} />);
    expect(screen.getByRole("checkbox", { name: /mensagem automática de acompanhamento/ })).not.toBeChecked();
    const save = screen.getByRole("button", { name: "Registrar avaliação realizada" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Data real do atendimento *"), { target: { value: "2026-10-17" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi que este resultado/ }));
    fireEvent.click(save);
    expect(data.onConfirm).toHaveBeenCalledWith(false, "2026-10-17");
    expect(screen.getByText(/O horário marcado será preservado/)).toBeInTheDocument();
  });
  it("allows an explicitly requested follow-up for an old result", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} />);
    fireEvent.change(screen.getByLabelText("Data real do atendimento *"), { target: { value: "2026-10-17" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi que este resultado/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /mensagem automática de acompanhamento/ }));
    expect(screen.getByText(/prazo da mensagem conta a partir desta baixa/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar avaliação realizada" }));
    expect(data.onConfirm).toHaveBeenCalledWith(true, "2026-10-17");
  });
  it("permits saving without a message when automation settings are unavailable", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} evaluation={{ ...evaluation, scheduled_at: "2026-10-18T12:00:00Z" }} settingsUnavailable />);
    expect(screen.getByRole("checkbox", { name: /mensagem automática de acompanhamento/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Registrar avaliação realizada" }));
    expect(data.onConfirm).toHaveBeenCalledWith(false, "2026-10-18");
  });
  it("prevents marking a no-show before the appointment time", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} outcome="no_show" evaluation={{ ...evaluation, scheduled_at: "2026-10-18T18:00:00Z" }} />);
    expect(screen.getByRole("button", { name: "Registrar falta" })).toBeDisabled();
    expect(screen.getByText(/Aguarde o horário/)).toBeInTheDocument();
  });
  it("requires confirmation that an early appointment actually happened today", () => {
    const data = props();
    render(<EvaluationOutcomeDialog {...data} evaluation={{ ...evaluation, scheduled_at: "2026-10-18T18:00:00Z" }} />);
    expect(screen.getByRole("button", { name: "Registrar avaliação realizada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /atendimento foi antecipado/ }));
    expect(screen.getByRole("button", { name: "Registrar avaliação realizada" })).toBeEnabled();
  });
  it("never schedules a message when cancelling and locks the dialog while saving", () => {
    const data = props();
    const view = render(<EvaluationOutcomeDialog {...data} outcome="cancel" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar avaliação" }));
    expect(data.onConfirm).toHaveBeenCalledWith(false);
    view.rerender(<EvaluationOutcomeDialog {...data} outcome="cancel" saving />);
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
  });
});
