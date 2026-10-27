import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CadastrarAlunoForm } from "@/components/alunos/CadastrarAlunoForm";

const mocks = vi.hoisted(() => ({ save: vi.fn(), welcome: vi.fn(), duplicate: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/studentRegistration", () => ({ saveStudentRegistration: mocks.save }));
vi.mock("@/lib/studentDuplicates", () => ({ findRegistrationDuplicates: mocks.duplicate }));
vi.mock("@/lib/welcomeReengagement", () => ({ scheduleWelcomeIfEnabled: mocks.welcome }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/alunos/StudentSheet", () => ({ StudentSheet: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockImplementation(async payload => ({ ...payload, created_at: "2026-10-15T12:00:00Z", status: "active" }));
  mocks.welcome.mockResolvedValue("disabled");
  mocks.duplicate.mockResolvedValue([]);
});
afterEach(cleanup);
function setup() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CadastrarAlunoForm /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Nome completo *"), { target: { value: "Marina Teste" } });
  fireEvent.change(screen.getByLabelText("WhatsApp *"), { target: { value: "(43) 99999-0000" } });
}
async function review() {
  fireEvent.click(screen.getByRole("button", { name: "Conferir cadastro" }));
  await screen.findByText("Confira antes de cadastrar");
}
describe("cadastro com conferência", () => {
  it("allows registering an active student without WhatsApp messages or welcome", async () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Permitir mensagens pelo WhatsApp/ }));
    expect(screen.getByRole("checkbox", { name: /Preparar uma mensagem de boas-vindas/ })).toBeDisabled();
    await review();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await screen.findByText("Marina Teste está cadastrado!");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ messages_enabled: false }));
    expect(mocks.welcome).not.toHaveBeenCalled();
    expect(screen.getByText(/Nenhuma boas-vindas foi preparada/)).toBeVisible();
  });
  it("conferir não grava e voltar preserva os dados", async () => {
    setup(); await review();
    expect(screen.getByText("Confira antes de cadastrar")).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Voltar e editar" }));
    expect(screen.getByLabelText("Nome completo *")).toHaveValue("Marina Teste");
  });
  it("salva matrícula, benefício e avaliação informada sem criar atendimento", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Início na academia *"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Benefício ou convênio"), { target: { value: "Desconto especial" } });
    fireEvent.click(screen.getByLabelText("O aluno já realizou avaliação antes deste cadastro"));
    fireEvent.change(screen.getByLabelText("Data da última avaliação *"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByLabelText(/Preparar uma mensagem/));
    await review(); fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await screen.findByText("Marina Teste está cadastrado!");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ phone: "5543999990000", enrollment_date: "2026-01-01", plan: "Mensal", benefit: "Desconto especial", initial_evaluation_date: "2026-09-01", last_evaluation_date: "2026-09-01", had_evaluation: true }));
    expect(mocks.welcome).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abrir ficha do aluno" })).toBeInTheDocument();
  });
  it("duplo clique não duplica cadastro e falha nas boas-vindas não desfaz o aluno", async () => {
    setup(); mocks.welcome.mockResolvedValue("failed"); await review();
    const confirm = screen.getByRole("button", { name: "Confirmar cadastro" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await screen.findByText(/Não foi possível confirmar as boas-vindas/);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Marina Teste está cadastrado!")).toBeInTheDocument();
  });
  it("falha ambígua mantém o mesmo identificador e os dados na tentativa seguinte", async () => {
    setup(); mocks.save.mockRejectedValueOnce(new Error("Conexão interrompida")); await review();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Voltar e editar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar confirmar novamente" }));
    await screen.findByText("Marina Teste está cadastrado!");
    expect(mocks.save.mock.calls[0][0]).toEqual(mocks.save.mock.calls[1][0]);
  });
  it("CPF duplicado permite corrigir os dados após rejeição explícita", async () => {
    setup(); mocks.save.mockRejectedValueOnce({ code: "23505", message: "CPF já cadastrado" }); await review();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Voltar e editar" })).toBeEnabled();
  });
  it("não permite avaliação anterior sem data nem nascimento após início", async () => {
    setup(); fireEvent.click(screen.getByLabelText("O aluno já realizou avaliação antes deste cadastro"));
    fireEvent.submit(screen.getByRole("button", { name: "Conferir cadastro" }).closest("form")!);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Informe uma data de avaliação anterior até hoje." }));
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Confira antes de cadastrar")).not.toBeInTheDocument());
  });
  it("impede cadastro com CPF já existente e encaminha para lista de alunos", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "529.982.247-25" } });
    mocks.duplicate.mockResolvedValue([{ id: "existente", name: "Marina Existente", matchesCpf: true, matchesPhone: false }]);
    await review();
    expect(mocks.duplicate).toHaveBeenCalledWith("5543999990000", "52998224725");
    expect(screen.getByText("CPF já cadastrado. Confira o aluno existente antes de continuar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar cadastro" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("permite WhatsApp compartilhado somente após confirmação explícita", async () => {
    setup();
    mocks.duplicate.mockResolvedValue([{ id: "familiar", name: "Familiar", matchesCpf: false, matchesPhone: true }]);
    await review();
    const confirm = screen.getByRole("button", { name: "Confirmar cadastro" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Confirmei que são alunos diferentes e que compartilham o número."));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await screen.findByText("Marina Teste está cadastrado!");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("falha ao consultar duplicações bloqueia avanço e permite tentar de novo", async () => {
    setup();
    mocks.duplicate.mockRejectedValueOnce(new Error("Sem conexão"));
    fireEvent.click(screen.getByRole("button", { name: "Conferir cadastro" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Confira antes de cadastrar")).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    await review();
    expect(mocks.duplicate).toHaveBeenCalledTimes(2);
  });
});
