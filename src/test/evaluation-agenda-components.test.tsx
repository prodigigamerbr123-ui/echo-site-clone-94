import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvaluationAgendaList } from "@/components/avaliacoes/EvaluationAgendaList";
import { EvaluationDueQueue } from "@/components/avaliacoes/EvaluationDueQueue";
import { EvaluationRescheduleDialog } from "@/components/avaliacoes/EvaluationRescheduleDialog";
import { EvaluationScheduleForm } from "@/components/avaliacoes/EvaluationScheduleForm";
import { PendingEvaluations } from "@/components/avaliacoes/PendingEvaluations";
import type { AgendaEvaluation } from "@/components/avaliacoes/agendaTypes";

afterEach(cleanup);
const evaluation: AgendaEvaluation = {
  id: "evaluation-fixture", student_id: "student-fixture", scheduled_at: "2026-10-15T15:00:00Z",
  status: "scheduled", notes: null, completed_at: null, students: { name: "Aluno fixture", phone: "fixture" },
};
function agendaProps() {
  return { grouped: [] as [string, AgendaEvaluation[]][], now: Date.parse("2026-10-15T16:00:00Z"),
    saving: false, error: null as unknown, isLoading: false, onRetry: vi.fn(),
    onDone: vi.fn(), onNoShow: vi.fn(), onReschedule: vi.fn(), onCancel: vi.fn() };
}
function formProps() {
  return { students: [], selected: undefined, values: { studentId: "", date: "", time: "09:00", notes: "" },
    today: "2026-10-15", saving: false, studentsLoading: false, studentsError: null as unknown,
    onChange: vi.fn(), onSubmit: vi.fn(), onRetry: vi.fn() };
}

describe("componentes da agenda", () => {
  it("distingue erro de agenda vazia e permite tentar novamente", () => {
    const props = agendaProps();
    render(<EvaluationAgendaList {...props} grouped={[["2026-10-15", [evaluation]]]} error={new Error("Consulta indisponível")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a agenda");
    expect(screen.queryByText("Nenhuma avaliação agendada.")).not.toBeInTheDocument();
    expect(screen.queryByText(evaluation.students!.name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("mostra carregamento antes de afirmar que não há avaliações", () => {
    render(<EvaluationAgendaList {...agendaProps()} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando avaliações");
    expect(screen.queryByText("Nenhuma avaliação agendada.")).not.toBeInTheDocument();
  });

  it("só mostra vazio depois da consulta concluída", () => {
    render(<EvaluationAgendaList {...agendaProps()} />);
    expect(screen.getByText("Nenhuma avaliação agendada.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("bloqueia todas as ações da avaliação durante uma operação", () => {
    render(<EvaluationAgendaList {...agendaProps()} grouped={[["2026-10-15", [evaluation]]]} saving />);
    for (const name of ["Realizada", "Faltou", "Remarcar", "Cancelar avaliação de Aluno fixture"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("não permite agendar com erro na lista de alunos", () => {
    const props = formProps();
    render(<EvaluationScheduleForm {...props} studentsError={{ message: "Sem acesso" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os alunos");
    expect(screen.getByRole("combobox", { name: "Aluno" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agendar Avaliação" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("encaminha os campos controlados do formulário sem duplicar estado", () => {
    const props = formProps();
    render(<EvaluationScheduleForm {...props} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "10:30" } });
    fireEvent.change(screen.getByLabelText("Observações (opcional)"), { target: { value: "Fixture" } });
    expect(props.onChange.mock.calls).toEqual([[{ date: "2026-10-20" }], [{ time: "10:30" }], [{ notes: "Fixture" }]]);
    fireEvent.click(screen.getByRole("button", { name: "Agendar Avaliação" }));
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it("mantém o diálogo de remarcação bloqueado durante a gravação", () => {
    const onClose = vi.fn();
    render(<EvaluationRescheduleDialog rescheduleTarget={evaluation} rDate="2026-10-20" rTime="10:30"
      today="2026-10-15" saving onDateChange={vi.fn()} onTimeChange={vi.fn()} onClose={onClose} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Data")).toBeDisabled();
    expect(screen.getByLabelText("Horário")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("preserva callbacks de fechamento das avaliações passadas", () => {
    const onDone = vi.fn(), onNoShow = vi.fn();
    render(<PendingEvaluations evaluations={[evaluation]} saving={false} onDone={onDone} onNoShow={onNoShow} />);
    fireEvent.click(screen.getByRole("button", { name: "Realizada" }));
    fireEvent.click(screen.getByRole("button", { name: "Faltou" }));
    expect(onDone).toHaveBeenCalledWith(evaluation);
    expect(onNoShow).toHaveBeenCalledWith(evaluation);
  });

  it("não transforma erro de cálculo em uma fila de vencidos vazia", () => {
    render(<EvaluationDueQueue overdueQueue={[]} dueError={new Error("Configuração indisponível")}
      dueReady={false} daysOverdue={null} now={0} onRetry={vi.fn()} onSelectStudent={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível calcular");
    expect(screen.queryByText("Nada vencido — 👏")).not.toBeInTheDocument();
  });
});
