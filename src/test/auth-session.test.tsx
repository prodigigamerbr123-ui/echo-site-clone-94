import { AuthProvider } from "@/components/providers/auth-provider";
import { useAuth } from "@/hooks/useAuth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FixtureSession = { user: { id: string }; access_token: string };

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: FixtureSession | null) => void),
  getSession: vi.fn(), rpc: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { onAuthStateChange: (fn: typeof mocks.listener) => {
    mocks.listener = fn; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  }, getSession: mocks.getSession, signOut: vi.fn() }, rpc: mocks.rpc,
} }));
function Probe() {
  const auth = useAuth();
  return <div data-testid="auth">{auth.user?.id ?? "none"}:{auth.role ?? "none"}:{String(auth.roleLoading)}</div>;
}
const session = (id: string) => ({ user: { id }, access_token: `token-${id}` });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.listener = null;
  mocks.getSession.mockResolvedValue({ data: { session: session("admin") } });
  mocks.rpc.mockResolvedValue({ data: "admin", error: null });
});
afterEach(cleanup);
describe("session isolation and staff revocation", () => {
  it("clears cached restricted data and hides the old role when switching users", async () => {
    const client = setup();
    await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("admin:admin:false"));
    client.setQueryData(["private-messages"], ["private"]);
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    act(() => mocks.listener?.("SIGNED_IN", session("evaluator")));
    expect(screen.getByTestId("auth")).toHaveTextContent("evaluator:none:true");
    expect(client.getQueryData(["private-messages"])).toBeUndefined();
  });
  it("revokes local access and clears the cache when focus detects a removed membership", async () => {
    const client = setup();
    await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("admin:admin:false"));
    client.setQueryData(["private-messages"], ["private"]);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("admin:none:false"));
    expect(client.getQueryData(["private-messages"])).toBeUndefined();
  });
  it("ignores an outdated initial session response after a sign-out event", async () => {
    let resolveSession!: (value: { data: { session: FixtureSession | null } }) => void;
    mocks.getSession.mockImplementation(() => new Promise(resolve => { resolveSession = resolve; }));
    setup();
    act(() => mocks.listener?.("SIGNED_OUT", null));
    await act(async () => resolveSession({ data: { session: session("admin") } }));
    expect(screen.getByTestId("auth")).toHaveTextContent("none:none:false");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
