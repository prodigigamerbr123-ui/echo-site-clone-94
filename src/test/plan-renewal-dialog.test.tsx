import { RenovarPlanoDialog } from "@/components/alunos/RenovarPlanoDialog";
import type { Student } from "@/components/alunos/studentListModel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), update: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => mocks.read() }) }),
      update: (changes: unknown) => {
        mocks.update(changes);
        const chain = { eq: () => chain, is: () => chain, select: () => Promise.resolve({ data: [{ id: "student-1" }], error: null }) };
        return chain;
      },
    }),
  },
}));

const student = {
  id: "student-1", name: "Aluno Exemplo", plan: "Mensal", payment_due_date: "2099-01-31",
} as Student;

function setup() {
  render(<QueryClientProvider client={new QueryClient()}>
    <RenovarPlanoDialog student={student} open onOpenChange={vi.fn()} />
  </QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: { id: student.id, plan: student.plan, payment_due_date: student.payment_due_date }, error: null });
});
afterEach(cleanup);

describe("renewal confirmation", () => {
  it("shows the suggested date and explains that no payment is registered", async () => {
    setup();
    expect(screen.getByLabelText("Próximo vencimento *")).toHaveValue("2099-02-28");
    expect(screen.getByText(/não registra recebimento/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar renovação" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ plan: "Mensal", payment_due_date: "2099-02-28" }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Plano atualizado" }));
  });

  it("refuses to replace a due date changed elsewhere", async () => {
    mocks.read.mockResolvedValue({ data: { id: student.id, plan: student.plan, payment_due_date: "2099-03-31" }, error: null });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar renovação" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível confirmar a renovação" })));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
