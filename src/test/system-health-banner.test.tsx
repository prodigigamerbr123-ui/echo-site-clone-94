import { SystemHealthBanner } from "@/components/layout/SystemHealthBanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  const result = { data: { started_at: new Date().toISOString(), status: "completed" }, count: 0, error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lt", "order", "limit", "maybeSingle"]) chain[method] = () => chain;
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return { supabase: { from: () => chain, functions: { invoke } } };
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemHealthBanner /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("system health banner", () => {
  it("shows the critical alert only when the provider reports a closed session", async () => {
    invoke.mockResolvedValue({ data: { state: "close", connected: false }, error: null });
    renderBanner();
    expect(await screen.findByText("WhatsApp desconectado")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("whatsapp-status", { body: { action: "status" } });
  });

  it("does not claim a disconnection when the status check fails", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("timeout") });
    renderBanner();
    expect(await screen.findByText(/Não foi possível confirmar a conexão do WhatsApp/)).toBeInTheDocument();
    expect(screen.queryByText("WhatsApp desconectado")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("treats a temporary reconnection as a warning", async () => {
    invoke.mockResolvedValue({ data: { state: "connecting", connected: false }, error: null });
    renderBanner();
    expect(await screen.findByText(/WhatsApp reconectando/)).toBeInTheDocument();
    expect(screen.queryByText("WhatsApp desconectado")).not.toBeInTheDocument();
  });

  it("stays hidden when the session is open and nothing else needs attention", async () => {
    invoke.mockResolvedValue({ data: { state: "open", connected: true }, error: null });
    const { container } = renderBanner();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
