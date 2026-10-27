import { StudentPlanHistory } from "@/components/alunos/StudentPlanHistory";
import type { Tables } from "@/integrations/supabase/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rows: [] as Tables<"student_plan_history">[], fail: false, missingCount: false, range: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    range: async (from: number, to: number) => {
      mock.range(from, to);
      return { data: mock.fail ? null : mock.rows.slice(from, to + 1), error: mock.fail ? { message: "Unavailable" } : null, count: mock.missingCount ? null : mock.rows.length };
    },
  };
  return chain;
} } }));
const entry: Tables<"student_plan_history"> = {
  id: "change-1", student_id: "student-1", previous_plan: "Mensal", plan: "Mensal",
  previous_due_date: "2026-10-18", payment_due_date: "2026-11-18", created_at: "2026-10-18T13:00:00Z", actor_id: null,
};
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><StudentPlanHistory studentId="student-1" open /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); mock.rows = [{ ...entry }]; mock.fail = false; mock.missingCount = false; });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("plan history in the student record", () => {
  it("shows the before and after dates without treating the change as payment", async () => {
    setup();
    expect(await screen.findByText("Plano mantido: Mensal")).toBeInTheDocument();
    expect(screen.getByText("18/10/2026")).toBeInTheDocument();
    expect(screen.getByText("18/11/2026")).toBeInTheDocument();
    expect(screen.getByText(/Não comprova pagamento/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 · Brasília/)).toBeInTheDocument();
  });
  it("loads older entries on demand and reports the full count", async () => {
    mock.rows = Array.from({ length: 6 }, (_, index) => ({ ...entry, id: `change-${index}` }));
    setup();
    await screen.findByText("Exibindo 5 de 6 alteração(ões).");
    fireEvent.click(screen.getByRole("button", { name: "Ver alterações anteriores" }));
    await screen.findByText("Exibindo 6 de 6 alteração(ões).");
    expect(mock.range).toHaveBeenCalledWith(0, 9);
    expect(screen.queryByRole("button", { name: "Ver alterações anteriores" })).not.toBeInTheDocument();
  });
  it("offers retry after a failure and explains an actual empty history", async () => {
    mock.fail = true;
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar");
    expect(screen.queryByText(/Nenhuma alteração registrada/)).not.toBeInTheDocument();
    mock.fail = false; mock.rows = [];
    fireEvent.click(screen.getByRole("button", { name: "Consultar histórico novamente" }));
    expect(await screen.findByText(/Mudanças antigas não foram reconstruídas/)).toBeInTheDocument();
  });
  it("refuses to call the history complete when the count is missing", async () => {
    mock.missingCount = true;
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar");
    expect(screen.queryByText(/Exibindo/)).not.toBeInTheDocument();
  });
});
