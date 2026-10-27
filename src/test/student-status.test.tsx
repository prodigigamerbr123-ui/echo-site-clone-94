import { StudentSheet } from "@/components/alunos/StudentSheet";
import { EditarAlunoDialog } from "@/components/alunos/EditarAlunoDialog";
import type { Student } from "@/components/alunos/studentListModel";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(), update: vi.fn(), save: vi.fn(), toast: vi.fn(), eq: vi.fn(), is: vi.fn(),
  schedule: vi.fn(), invalidateQueries: vi.fn(), onOpenChange: vi.fn(),
}));

vi.mock("@/components/ui/confirm-dialog-store", () => ({ confirm: mocks.confirm }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/lib/welcomeReengagement", () => ({ scheduleReengagementIfEnabled: mocks.schedule }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({ data: undefined, isError: false, isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        mocks.update(payload);
        const chain = {
          eq: (key: string, value: unknown) => { mocks.eq(key, value); return chain; },
          is: (key: string, value: unknown) => { mocks.is(key, value); return chain; },
          select: () => ({ maybeSingle: () => mocks.save() }),
        };
        return chain;
      },
    }),
  },
}));

const student = {
  id: "student-1", name: "Aluno Exemplo", phone: "43999990000", status: "active",
  created_at: "2026-10-01T12:00:00Z", had_evaluation: false,
  plan: "Mensal", payment_due_date: "2026-11-18",
} as Student;

function setup() {
  render(<MemoryRouter><StudentSheet student={student} open onOpenChange={mocks.onOpenChange} /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue(true);
  mocks.save.mockResolvedValue({ data: { id: student.id }, error: null });
  mocks.schedule.mockResolvedValue("disabled");
});
afterEach(cleanup);

describe("student status confirmation", () => {
  it("keeps an active student unchanged when inactivation is cancelled", async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    setup();
    fireEvent.click(screen.getByRole("switch", { name: "Alterar status do aluno" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
  });

  it("detects a concurrent status change and skips reengagement", async () => {
    mocks.save.mockResolvedValueOnce({ data: null, error: null });
    setup();
    fireEvent.click(screen.getByRole("switch", { name: "Alterar status do aluno" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Aluno alterado em outra tela" })));
    expect(mocks.update).toHaveBeenCalledWith({ status: "inactive" });
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
  });

  it("warns when inactivation succeeds but automation scheduling fails", async () => {
    mocks.schedule.mockResolvedValueOnce("failed");
    setup();
    fireEvent.click(screen.getByRole("switch", { name: "Alterar status do aluno" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Aluno marcado como inativo",
      description: expect.stringContaining("Não foi possível agendar"),
    })));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("student editing concurrency", () => {
  it("requires confirmation before disabling contact without changing membership", async () => {
    render(<EditarAlunoDialog student={student} open onOpenChange={mocks.onOpenChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Permitir mensagens pelo WhatsApp" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "active", messages_enabled: false })));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Desativar mensagens deste aluno?" }));
    expect(mocks.eq).toHaveBeenCalledWith("messages_enabled", true);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("preserves contact when disabling is cancelled", async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    render(<EditarAlunoDialog student={student} open onOpenChange={mocks.onOpenChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Permitir mensagens pelo WhatsApp" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
  });
  function setupEdit() {
    render(<EditarAlunoDialog student={student} open onOpenChange={mocks.onOpenChange} />);
    fireEvent.change(screen.getByLabelText("Nome completo *"), { target: { value: "Nome atualizado" } });
    return screen.getByRole("button", { name: "Salvar Alterações" }).closest("form")!;
  }

  it("guards the original plan, due date and nullable fields when saving", async () => {
    fireEvent.submit(setupEdit());
    await waitFor(() => expect(mocks.onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.eq).toHaveBeenCalledWith("plan", "Mensal");
    expect(mocks.eq).toHaveBeenCalledWith("payment_due_date", "2026-11-18");
    expect(mocks.eq).toHaveBeenCalledWith("status", "active");
    expect(mocks.is).toHaveBeenCalledWith("cpf", null);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("reports a stale edit without claiming success or closing the form", async () => {
    mocks.save.mockResolvedValueOnce({ data: null, error: null });
    fireEvent.submit(setupEdit());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Erro ao atualizar aluno", description: expect.stringContaining("alterado em outra tela"),
    })));
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("accepts only one save while a previous request is pending", async () => {
    let finish!: (result: { data: { id: string }; error: null }) => void;
    mocks.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const form = setupEdit();
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    finish({ data: { id: student.id }, error: null });
    await waitFor(() => expect(mocks.onOpenChange).toHaveBeenCalledWith(false));
  });
});
