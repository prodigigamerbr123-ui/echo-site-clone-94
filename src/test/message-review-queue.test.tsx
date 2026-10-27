import { MessageReviewDialog } from "@/components/mensagens/MessageReviewDialog";
import { buildMessageReview } from "@/lib/messageReview";
import type { ReviewQueueMessage } from "@/lib/messageReviewQueue";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/messageReviewQueue", () => ({ fetchMessageReviewQueue: fixture.load }));
const row: ReviewQueueMessage = { id: "existing", student_id: "a", content: "Olá Ana", status: "pending", scheduled_for: "2026-10-20T15:00:00Z", updated_at: "2026-10-18T15:00:00Z" };
const clients: QueryClient[] = [];
const review = buildMessageReview([{ id: "a", name: "Ana", phone: "43999990000", had_evaluation: false }], "Olá {nome}", { kind: "now" });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const confirm = vi.fn();
  render(<QueryClientProvider client={client}><MessageReviewDialog review={review} saving={false} error={null} onBack={vi.fn()} onConfirm={confirm} /></QueryClientProvider>);
  return { confirm };
}
beforeEach(() => { vi.resetAllMocks(); fixture.load.mockResolvedValue([]); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

it("waits for the queue and requires acknowledgement when an existing message has the same text", async () => {
  let finish!: (rows: ReviewQueueMessage[]) => void;
  fixture.load.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { confirm } = setup();
  expect(screen.getByRole("button", { name: "Confirmar e colocar na fila" })).toBeDisabled();
  finish([row]);
  expect(await screen.findByText(/Mesmo texto desta revisão/)).toBeVisible();
  const button = screen.getByRole("button", { name: "Confirmar e colocar na fila" });
  expect(button).toBeDisabled();
  expect(screen.getByText(/20\/10\/2026, 12:00/)).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: /Conferi a fila/ }));
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledOnce();
});
it("allows retry after query failure without treating failure as an empty queue", async () => {
  fixture.load.mockRejectedValueOnce(new Error("offline"));
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível conferir a fila");
  expect(screen.getByRole("button", { name: "Confirmar e colocar na fila" })).toBeDisabled();
  expect(screen.queryByText(/Nenhum envio pendente/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar fila" }));
  expect(await screen.findByText(/Nenhum envio pendente/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar e colocar na fila" })).toBeEnabled();
});
it("requires a fresh acknowledgement if refreshing detects a changed queue", async () => {
  fixture.load.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ ...row, status: "uncertain", updated_at: "2026-10-18T16:00:00Z" }]);
  setup();
  fireEvent.click(await screen.findByRole("checkbox", { name: /Conferi a fila/ }));
  expect(screen.getByRole("button", { name: "Confirmar e colocar na fila" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar fila" }));
  expect(await screen.findByText(/Resultado incerto — confira no WhatsApp/)).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /Conferi a fila/ })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Confirmar e colocar na fila" })).toBeDisabled();
});
it("labels a failed worker record with a dispatch marker as uncertain during composition", async () => {
  fixture.load.mockResolvedValue([{ ...row, status: "failed", dispatch_started_at: "2026-10-18T15:01:00Z" }]);
  setup();
  expect(await screen.findByText(/Resultado incerto — confira no WhatsApp/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar e colocar na fila" })).toBeDisabled();
});
it("shows more existing records without hiding the total", async () => {
  fixture.load.mockResolvedValue(Array.from({ length: 11 }, (_, index) => ({ ...row, id: String(index), content: `Texto ${index}`, scheduled_for: index === 10 ? "infinity" : row.scheduled_for })));
  setup();
  expect(await screen.findByText(/Há 11 mensagem/)).toBeVisible();
  expect(screen.queryByText("Texto 10")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver mais (1)" }));
  await waitFor(() => expect(screen.getByText("Texto 10")).toBeVisible());
  expect(screen.getByText(/Data indisponível/)).toBeVisible();
});
