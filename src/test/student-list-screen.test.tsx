import { ListaAlunos } from "@/components/alunos/ListaAlunos";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/components/alunos/StudentSheet", () => ({ StudentSheet: () => null }));
vi.mock("@/components/alunos/EditarAlunoDialog", () => ({ EditarAlunoDialog: () => null }));
vi.mock("@/hooks/useStudentListData", () => ({ useStudentListData: () => ({
  studentsError: fixture.error, isLoading: false, pendingScheduled: [],
  students: fixture.error ? undefined : [{
    id: "student-1", name: "Ana Silva", phone: "43999990000", cpf: null,
    birth_date: "2000-01-01", last_evaluation_date: null, had_evaluation: false,
    created_at: "2026-10-01T12:00:00Z", plan: "Mensal", status: "active",
    city: null, payment_due_date: null,
  }],
}) }));

beforeEach(() => { fixture.error = null; localStorage.clear(); });
afterEach(cleanup);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ListaAlunos /></MemoryRouter></QueryClientProvider>);
  return client;
}

describe("student list screen", () => {
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
