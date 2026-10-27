import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AgendaEvaluation, AgendaStudent } from "@/components/avaliacoes/agendaTypes";

const fixture = vi.hoisted(() => ({
  students: undefined as AgendaStudent[] | undefined,
  queryError: null as Error | null,
  toast: vi.fn(),
  finish: vi.fn(), evaluations: [] as AgendaEvaluation[],
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock("@/hooks/useAgendaClock", () => ({ useAgendaClock: () => Date.parse("2026-10-15T15:00:00Z") }));
vi.mock("@/hooks/useEvaluationAgendaActions", () => ({ useEvaluationAgendaActions: () => ({
  saving: false, schedule: vi.fn(), finish: fixture.finish, invalidate: vi.fn(),
}) }));
vi.mock("@/hooks/useEvaluationAgendaQueries", () => ({ useEvaluationAgendaQueries: () => ({
  students: { data: fixture.students, error: null, isPending: !fixture.students, refetch: vi.fn() },
  evaluations: { data: fixture.evaluations, error: fixture.queryError, isPending: false, refetch: vi.fn() },
  settings: { data: { evaluation_invite: { params: { days_overdue: 90 } } }, error: null },
}) }));

import AgendarAvaliacao from "@/pages/AgendarAvaliacao";

const student = (id: string): AgendaStudent => ({ id, name: `Aluno ${id}`, phone: "fixture",
  status: "active", had_evaluation: null, last_evaluation_date: null, created_at: "2025-01-01T00:00:00Z" });
function page() {
  return <MemoryRouter initialEntries={["/agendar-avaliacao?aluno=a"]}><AgendarAvaliacao /></MemoryRouter>;
}
beforeEach(() => { fixture.students = [student("a"), student("b")]; fixture.queryError = null; fixture.evaluations = []; fixture.finish.mockReset().mockResolvedValue({ evaluation_id: "eval-1", messages_created: 0, already_applied: false, in_flight: 0 }); });
afterEach(cleanup);

describe("pré-seleção na agenda", () => {
  it("reviews an old result, saves without a message, and prepares a new appointment for the same person", async () => {
    fixture.evaluations = [{ id: "eval-1", student_id: "b", scheduled_at: "2026-10-14T12:00:00Z", status: "scheduled", notes: null, completed_at: null, students: { name: "Aluno b", phone: "fixture" } }];
    render(page());
    fireEvent.click(screen.getByRole("button", { name: "Realizada" }));
    expect(fixture.finish).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Data real do atendimento *"), { target: { value: "2026-10-13" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi que este resultado/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar avaliação realizada" }));
    expect(await screen.findByRole("region", { name: "Resultado do atendimento" })).toHaveTextContent("Nenhuma nova mensagem automática");
    expect(fixture.finish).toHaveBeenCalledWith("eval-1", "Aluno b", "completed", { sendAutomaticMessage: false, performedOn: "2026-10-13" });
    fireEvent.click(screen.getByRole("button", { name: "Agendar próximo acompanhamento" }));
    expect(screen.getByRole("combobox", { name: "Aluno" })).toHaveTextContent("Aluno b");
    expect(screen.getByLabelText("Data")).toHaveValue("");
  });
  it("preserva a escolha manual quando a consulta de alunos é atualizada", () => {
    const view = render(page());
    expect(screen.getByRole("combobox", { name: "Aluno" })).toHaveTextContent("Aluno a");
    fireEvent.click(screen.getAllByRole("button", { name: "Agendar" })[1]);
    expect(screen.getByRole("combobox", { name: "Aluno" })).toHaveTextContent("Aluno b");
    fixture.students = fixture.students?.map((value) => ({ ...value }));
    view.rerender(page());
    expect(screen.getByRole("combobox", { name: "Aluno" })).toHaveTextContent("Aluno b");
  });

  it("aguarda os alunos antes de aplicar o parâmetro do link", () => {
    fixture.students = undefined;
    const view = render(page());
    expect(screen.getByRole("combobox", { name: "Aluno" })).toBeDisabled();
    fixture.students = [student("a"), student("b")];
    view.rerender(page());
    expect(screen.getByRole("combobox", { name: "Aluno" })).toHaveTextContent("Aluno a");
  });

  it("não apresenta zero nas métricas quando a consulta de avaliações falha", () => {
    fixture.queryError = new Error("Consulta indisponível");
    render(page());
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("Nenhuma avaliação agendada.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
