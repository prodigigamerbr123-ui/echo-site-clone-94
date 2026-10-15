import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Configuracoes from "@/pages/Configuracoes";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/appSettings";

const mocks = vi.hoisted(() => ({ query: vi.fn(), mutateAsync: vi.fn(), pending: false,
  refetch: vi.fn(), success: vi.fn(), failure: vi.fn() }));
vi.mock("@/lib/appSettings", async (original) => ({
  ...await original<typeof import("@/lib/appSettings")>(),
  useNotificationSettings: () => mocks.query(),
  useUpdateNotificationSettings: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.failure } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending = false;
  mocks.query.mockReturnValue({ data: DEFAULT_NOTIFICATION_SETTINGS, isLoading: false,
    error: null, refetch: mocks.refetch });
  mocks.mutateAsync.mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS);
});
afterEach(cleanup);

describe("basic notification settings reliability", () => {
  it("shows a retryable error instead of an endless loading state", () => {
    mocks.query.mockReturnValue({ data: undefined, error: new Error("network"),
      isLoading: false, refetch: mocks.refetch });
    render(<Configuracoes />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("blocks editing stale settings when a refresh failed", () => {
    mocks.query.mockReturnValue({ data: DEFAULT_NOTIFICATION_SETTINGS,
      error: new Error("network"), isLoading: false, refetch: mocks.refetch });
    render(<Configuracoes />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ativar tudo" })).not.toBeInTheDocument();
  });

  it("disables controls and exposes saving status during a write", () => {
    mocks.pending = true;
    render(<Configuracoes />);
    for (const control of screen.getAllByRole("switch")) expect(control).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ativar tudo" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Agrupar a cada" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Salvando configuração");
  });

  it("prevents duplicate writes before pending state renders", async () => {
    let finish!: () => void;
    mocks.mutateAsync.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<Configuracoes />);
    const control = screen.getByRole("switch", { name: "Falha no envio de mensagem" });
    fireEvent.click(control);
    fireEvent.click(control);
    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("restores the persisted interval when saving fails", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("network"));
    render(<Configuracoes />);
    const interval = screen.getByRole("spinbutton", { name: "Agrupar a cada" });
    fireEvent.change(interval, { target: { value: "25" } });
    fireEvent.blur(interval);
    await waitFor(() => expect(interval).toHaveValue(10));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ sent_summary_minutes: 25 });
    expect(mocks.failure).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
