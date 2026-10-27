import { ListaAlunos } from "@/components/alunos/ListaAlunos";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ error: null as Error | null, inactiveLate: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/components/alunos/StudentSheet", () => ({ StudentSheet: ({ student, open, onOpenChange }: { student: { name: string } | null; open: boolean; onOpenChange: (open: boolean) => void }) => open && student ? <div role="dialog" aria-label="Ficha solicitada">{student.name}<button onClick={() => onOpenChange(false)}>Fechar ficha</button></div> : null }));
vi.mock("@/components/alunos/EditarAlunoDialog", () => ({ EditarAlunoDialog: () => null }));
vi.mock("@/hooks/useStudentListData", () => ({ useStudentListData: () => ({
  studentsError: fixture.error, isLoading: false, pendingScheduled: [],
  students: fixture.error ? undefined : [{
    id: "student-1", name: "Ana Silva", phone: "43999990000", cpf: null,
    birth_date: "2000-01-01", last_evaluation_date: null, had_evaluation: false,
    created_at: "2026-10-01T12:00:00Z", plan: "Mensal", status: "active",
    city: null, payment_due_date: null,
  }, ...(fixture.inactiveLate ? [{
    id: "student-2", name: "Bruno Inativo", phone: "43999990001", cpf: null,
    birth_date: null, last_evaluation_date: null, had_evaluation: false,
    created_at: "2026-01-01T12:00:00Z", plan: "Mensal", status: "inactive",
    city: null, payment_due_date: "2026-01-31",
  }] : [])],
}) }));

beforeEach(() => { fixture.error = null; fixture.inactiveLate = false; localStorage.clear(); });
afterEach(cleanup);

function setup(url = "/alunos") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><ListaAlunos /></MemoryRouter></QueryClientProvider>);
  return client;
}

describe("student list screen", () => {
  it("opens the exact student from the dashboard once and allows closing the record", () => {
    setup("/alunos?aluno=student-1");
    expect(screen.getByRole("dialog", { name: "Ficha solicitada" })).toHaveTextContent("Ana Silva");
    fireEvent.click(screen.getByRole("button", { name: "Fechar ficha" }));
    fireEvent.change(screen.getByPlaceholderText("Buscar por nome, telefone ou CPF..."), { target: { value: "Ana" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("applies the dashboard due-date filter instead of showing every student", () => {
    setup("/alunos?status=active&vencimento=overdue");
    expect(screen.getByText("Nenhum aluno encontrado com os filtros aplicados.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getAllByText("Ana Silva")).toHaveLength(2);
  });
  it("does not mark an inactive student's old due date as overdue", () => {
    fixture.inactiveLate = true;
    setup();
    expect(screen.getAllByText("Bruno Inativo").length).toBeGreaterThan(0);
    // O atalho de filtro tem o mesmo texto; nenhum selo fora de botões pode aparecer.
    expect(screen.queryAllByText("Prazo vencido").filter((element) => !element.closest("button"))).toHaveLength(0);
  });
  it("shows a loading failure and lets the user retry instead of reporting an empty gym", () => {
    fixture.error = new Error("Database unavailable");
    const client = setup();
    const retry = vi.spyOn(client, "invalidateQueries");
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os alunos");
    expect(screen.queryByText("Nenhum aluno cadastrado ainda.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledWith({ queryKey: ["students"] });
  });

  it("keeps calendar birthdays and supports searching and clearing filters after extraction", () => {
    setup();
    expect(screen.getByText("01/01")).toBeInTheDocument();
    const search = screen.getByPlaceholderText("Buscar por nome, telefone ou CPF...");
    fireEvent.change(search, { target: { value: "Bruno" } });
    expect(screen.getByText("Nenhum aluno encontrado com os filtros aplicados.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getAllByText("Ana Silva")).toHaveLength(2);
  });
});
