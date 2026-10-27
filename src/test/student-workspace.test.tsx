import { StudentSheet } from "@/components/alunos/StudentSheet";
import type { Student } from "@/components/alunos/studentListModel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  record: {} as Record<string, unknown>,
  evaluation: null as Record<string, unknown> | null,
  evaluationError: false, recordError: false, role: "admin",
  onClose: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: fixture.role }) }));
vi.mock("@/lib/welcomeReengagement", () => ({ scheduleReengagementIfEnabled: async () => "disabled" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
  let changes: Record<string, unknown> | null = null;
  function result(single = false) {
    if ((table === "students" && fixture.recordError) || (table === "evaluations" && fixture.evaluationError)) {
      return { data: null, error: { message: "Indisponível" } };
    }
    const rows = table === "students" ? [fixture.record] : table === "evaluations" && fixture.evaluation ? [fixture.evaluation] : [];
    const selected = rows.filter(row => predicates.every(matches => matches(row)));
    if (changes) selected.forEach(row => Object.assign(row, changes));
    return { data: single ? selected[0] ? { ...selected[0] } : null : selected.map(row => ({ ...row })), error: null, count: selected.length };
  }
  const chain = {
    select: () => chain,
    update: (payload: Record<string, unknown>) => { changes = payload; return chain; },
    eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return chain; },
    is: (key: string, value: unknown) => { predicates.push(row => (row[key] ?? null) === value); return chain; },
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    maybeSingle: async () => result(true),
    single: async () => result(true),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
} } }));

const original: Student = {
  id: "student-1", name: "Aluno Exemplo", phone: "43999990000", status: "active",
  created_at: "2026-01-01T12:00:00Z", had_evaluation: false,
  plan: "Mensal", payment_due_date: "2099-01-31", birth_date: null, city: null,
  cpf: null, last_evaluation_date: null, enrollment_date: null, benefit: null, messages_enabled: true,
};
const clients: QueryClient[] = [];
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter>
    <StudentSheet student={original} open onOpenChange={fixture.onClose} /><Location />
  </MemoryRouter></QueryClientProvider>);
}
async function ready() {
  const button = await screen.findByRole("button", { name: "Editar cadastro" });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.record = { ...original };
  fixture.evaluation = null;
  fixture.recordError = false;
  fixture.evaluationError = false;
  fixture.role = "admin";
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("student workspace", () => {
  it("returns to the same record with updated data after editing", async () => {
    setup();
    fireEvent.click(await ready());
    fireEvent.change(await screen.findByLabelText("Nome completo *"), { target: { value: "Nome revisado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await screen.findByRole("heading", { name: "Nome revisado" });
    expect(await ready()).toBeEnabled();
    expect(fixture.onClose).not.toHaveBeenCalled();
  });

  it("shows the renewed date in the reopened record", async () => {
    setup(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Renovar plano" }));
    expect(await screen.findByLabelText("Próximo vencimento *")).toHaveValue("2099-02-28");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar renovação" }));
    await screen.findByText("28/02/2099");
    expect(await ready()).toBeEnabled();
    expect(fixture.onClose).not.toHaveBeenCalled();
  });

  it("opens the agenda with the same student when an appointment already exists", async () => {
    fixture.evaluation = { id: "eval-1", student_id: original.id, status: "scheduled", scheduled_at: "2099-01-31T12:00:00Z" };
    setup(); await ready();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir agenda" }));
    expect(screen.getByTestId("location")).toHaveTextContent("?aluno=student-1");
    expect(fixture.onClose).toHaveBeenCalledWith(false);
  });

  it("highlights an old appointment still awaiting its result", async () => {
    fixture.evaluation = { id: "eval-1", student_id: original.id, status: "scheduled", scheduled_at: "2020-01-31T12:00:00Z" };
    setup(); await ready();
    expect(await screen.findByText("Avaliação aguardando baixa:")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agendar avaliação" })).not.toBeInTheDocument();
  });

  it("does not describe a failed agenda lookup as having no appointments", async () => {
    fixture.evaluationError = true;
    setup(); await ready();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível conferir os agendamentos");
    expect(screen.getByRole("button", { name: "Abrir agenda" })).toBeEnabled();
    expect(screen.queryByText(/sem agendamento em aberto/)).not.toBeInTheDocument();
  });

  it("blocks changes while the record cannot be refreshed", async () => {
    fixture.recordError = true;
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível atualizar a ficha");
    expect(screen.getByRole("button", { name: "Editar cadastro" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Renovar plano" })).toBeDisabled();
  });

  it("keeps administrative actions hidden from evaluators", async () => {
    fixture.role = "avaliador";
    setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Agendar avaliação" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Editar cadastro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renovar plano" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preparar mensagem" })).not.toBeInTheDocument();
  });
});
