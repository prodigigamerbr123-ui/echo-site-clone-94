import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ScheduledList from "@/components/mensagens/ScheduledList";

const mocks = vi.hoisted(() => ({ pages: vi.fn(), update: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));
const message = { id: "message-1", student_id: "student-1", content: "Texto preservado",
  scheduled_for: "2099-01-01T15:00:00.000Z", created_at: "2026-10-15T12:00:00Z",
  status: "failed", message_type: "manual", dispatch_started_at: null };
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/fetchAllPages", () => ({ fetchAllPages: mocks.pages }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ update: () => {
    const chain = { eq: () => chain, is: () => chain, select: () => chain, maybeSingle: mocks.update };
    return chain;
  } }), rpc: mocks.rpc,
} }));
vi.mock("@/components/agendarmensagem/MessageFilters", () => ({ default: () => null }));
vi.mock("@/components/agendarmensagem/MessagesList", () => ({ default: (props: {
  onEdit: (row: typeof message) => void; onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
}) => <div><button onClick={() => props.onEdit(message)}>Editar fixture</button>
  <button onClick={() => props.onDelete(message.id)}>Cancelar fixture</button>
  <button onClick={() => props.onRetry?.(message.id)}>Reenviar fixture</button></div> }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pages.mockResolvedValueOnce([message]).mockResolvedValueOnce([{ id: "student-1", name: "Fixture", phone: "000" }]);
});
afterEach(cleanup);

it("refreshes the list on demand without changing or requeueing messages", async () => {
  render(<ScheduledList statusFilter="failed" />);
  const refresh = await screen.findByRole("button", { name: "Atualizar lista" });
  mocks.pages.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  fireEvent.click(refresh);
  expect(await screen.findByText("Nenhuma mensagem.")).toBeVisible();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("does not retry a failed message after the student has disabled contact", async () => {
  mocks.pages.mockReset().mockResolvedValueOnce([message]).mockResolvedValueOnce([{ id: "student-1", name: "Fixture", phone: "000", messages_enabled: false }]);
  render(<ScheduledList statusFilter="failed" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reenviar fixture" }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Mensagens desativadas para este aluno" }));
});

it("does not claim a retry when a concurrent opt-out cancels it in the database", async () => {
  mocks.update.mockResolvedValue({ data: { id: message.id, status: "cancelled" }, error: null });
  render(<ScheduledList statusFilter="failed" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reenviar fixture" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("aluno está com mensagens desativadas");
  expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Reenfileirada — próxima tentativa em 1 min" }));
});

it("shows query failure instead of an empty queue and allows retry", async () => {
  mocks.pages.mockReset().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
  render(<ScheduledList statusFilter="failed" emptyLabel="Nenhuma falha" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  expect(screen.queryByText("Nenhuma falha")).not.toBeInTheDocument();
  mocks.pages.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Nenhuma falha")).toBeVisible();
});

it("keeps an edited draft and releases the submit lock after a thrown network error", async () => {
  let reject!: (error: Error) => void;
  mocks.update.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  render(<ScheduledList statusFilter="failed" />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar fixture" }));
  fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Rascunho novo" } });
  const save = screen.getByRole("button", { name: "Salvar" });
  fireEvent.click(save); fireEvent.click(save);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  reject(new Error("Sem conexão"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
  expect(screen.getByLabelText("Mensagem")).toHaveValue("Rascunho novo");
  expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
  expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Atualizada" }));
});

it("keeps cancellation open when the server cannot confirm it", async () => {
  mocks.rpc.mockRejectedValue(new Error("Falha de rede"));
  render(<ScheduledList statusFilter="failed" />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar fixture" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar envios" }));
  await waitFor(() => expect(screen.getByRole("alertdialog")).toHaveTextContent("Falha de rede"));
  expect(screen.getByRole("button", { name: "Cancelar envios" })).toBeEnabled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it("marks reviewed failures without sending and leaves possibly delivered ones out", async () => {
  const uncertain = { ...message, id: "message-2", dispatch_started_at: "2026-10-11T12:00:00Z" };
  mocks.pages.mockReset().mockResolvedValueOnce([message, uncertain]).mockResolvedValueOnce([{ id: "student-1", name: "Fixture", phone: "000" }])
    .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  mocks.rpc.mockResolvedValue({ data: { dismissed: 1 }, error: null });
  render(<ScheduledList statusFilter="failed" />);
  fireEvent.click(await screen.findByRole("button", { name: "Marcar como revisadas (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "Marcar como revisadas" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("dismiss_failed_messages_tx", { _ids: ["message-1"] }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "1 falha(s) marcada(s) como revisada(s)" }));
});
