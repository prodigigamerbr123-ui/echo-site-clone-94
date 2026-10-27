import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";

const mocks = vi.hoisted(() => ({ pages: vi.fn() }));
vi.mock("@/lib/fetchAllPages", () => ({ fetchAllPages: mocks.pages }));
vi.mock("@/components/mensagens/MessageFilters", () => ({ default: () => null }));
vi.mock("@/components/mensagens/MessagesList", () => ({ default: () => <p>Histórico confirmado</p> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.resetAllMocks(); });

it("refreshes the history on demand and updates its count", async () => {
  mocks.pages.mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MensagensEnviadasTab /></QueryClientProvider>);
  const refresh = await screen.findByRole("button", { name: "Atualizar histórico" });
  expect(screen.getByRole("tab", { name: "Enviadas (0)" })).toBeVisible();
  mocks.pages.mockResolvedValueOnce([{ id: "new", student_id: "a", content: "Fixture", status: "sent", sent_at: new Date().toISOString() }]).mockResolvedValueOnce([]);
  fireEvent.click(refresh);
  expect(await screen.findByRole("tab", { name: "Enviadas (1)" })).toBeVisible();
});

it.each([0, 1])("does not present partial data as an empty history when query %i fails", async (failed) => {
  mocks.pages.mockImplementationOnce(() => failed === 0 ? Promise.reject(new Error("offline")) : Promise.resolve([]))
    .mockImplementationOnce(() => failed === 1 ? Promise.reject(new Error("offline")) : Promise.resolve([]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MensagensEnviadasTab /></QueryClientProvider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  expect(screen.queryByText("Histórico confirmado")).not.toBeInTheDocument();
  mocks.pages.mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Histórico confirmado")).toBeVisible();
});
