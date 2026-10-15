import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MensagensPredefinidas from "@/pages/MensagensPredefinidas";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/predefinedMessages", () => ({ loadPredefinedMessages: mocks.load,
  savePredefinedMessage: mocks.save, deletePredefinedMessage: mocks.remove }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/whatsapp/WhatsAppPreview", () => ({ WhatsAppPreview: () => null }));
const model = { id: "fixture-id", title: "Boas-vindas", content: "Olá {nome}", created_at: "2026-10-15T12:00:00Z" };
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ messages: [model], automationIds: new Set() });
  mocks.save.mockResolvedValue(model);
});
afterEach(() => { cleanup(); client?.clear(); });
function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MensagensPredefinidas /></QueryClientProvider>);
}
describe("predefined messages screen reliability", () => {
  it("offers retry for a load error rather than reporting an empty catalog", async () => {
    mocks.load.mockRejectedValueOnce(new Error("offline"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Nenhuma mensagem pré-definida ainda.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(model.title)).toBeInTheDocument();
  });
  it("keeps the user's draft open when an update is not confirmed", async () => {
    mocks.save.mockRejectedValue(new Error("Mensagem removida"));
    setup();
    await screen.findByText(model.title);
    fireEvent.click(screen.getByRole("button", { name: "Editar mensagem pré-definida" }));
    fireEvent.change(screen.getByLabelText("Conteúdo da Mensagem"), { target: { value: "Novo texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar Mensagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mensagem removida");
    expect(screen.getByLabelText("Conteúdo da Mensagem")).toHaveValue("Novo texto");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Sucesso!" }));
  });
  it("uses one write for repeated clicks and keeps the same creation identity on retry", async () => {
    let rejectFirst!: (error: Error) => void;
    mocks.save.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }));
    setup();
    await screen.findByText(model.title);
    fireEvent.click(screen.getByRole("button", { name: "Nova Mensagem" }));
    fireEvent.change(screen.getByLabelText("Título da Mensagem"), { target: { value: "Novo modelo" } });
    fireEvent.change(screen.getByLabelText("Conteúdo da Mensagem"), { target: { value: "Texto" } });
    const submit = screen.getByRole("button", { name: "Criar Mensagem" });
    act(() => { submit.click(); submit.click(); });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Conteúdo da Mensagem")).toBeDisabled();
    client.setQueryData(["message-composer-data"], { cached: true });
    const firstId = mocks.save.mock.calls[0][0];
    await act(async () => rejectFirst(new Error("Resposta perdida")));
    fireEvent.click(screen.getByRole("button", { name: "Criar Mensagem" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0]).toBe(firstId);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(client.getQueryState(["message-composer-data"])?.isInvalidated).toBe(true);
  });
});
