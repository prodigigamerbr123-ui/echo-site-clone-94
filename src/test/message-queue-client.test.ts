// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const { rpc, getSession } = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, auth: { getSession } } }));
const storage = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  rpc.mockReset(); getSession.mockReset(); storage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  getSession.mockResolvedValue({ data: { session: { user: { id: "admin" } } }, error: null });
  rpc.mockImplementation(async (_name, args) => ({ data: { request_id: args._request_id, queued: 1, replayed: false }, error: null }));
});
afterEach(() => vi.unstubAllGlobals());
const ids = ["00000000-0000-4000-8000-000000000001"];

describe("durable enqueue request identity", () => {
  it("passes a schedule intent instead of browser-generated queue rows", async () => {
    const { enqueueMessages } = await import("@/lib/messageQueue");
    expect(await enqueueMessages(ids," Olá ",{ kind: "now" },"composer")).toMatchObject({ queued: 1 });
    expect(rpc).toHaveBeenCalledWith("enqueue_messages_tx", expect.objectContaining({ _student_ids: ids, _content: "Olá", _schedule: { kind: "now" } }));
    expect(storage.size).toBe(0);
  });
  it("retains the ID after a lost response, including after reloading the module", async () => {
    let client = await import("@/lib/messageQueue");
    rpc.mockRejectedValueOnce(new Error("Connection lost after commit"));
    await expect(client.enqueueMessages(ids,"Mensagem privada",{ kind: "now" },"composer")).rejects.toThrow("Connection lost");
    const original = rpc.mock.calls[0][1]._request_id;
    expect([...storage.keys()].every(key => !key.includes("Mensagem privada"))).toBe(true);
    expect([...storage.values()]).toEqual([original]);
    vi.resetModules(); client = await import("@/lib/messageQueue");
    await client.enqueueMessages(ids,"Mensagem privada",{ kind: "now" },"composer");
    expect(rpc.mock.calls[1][1]._request_id).toBe(original);
  });
  it("ignores presentation-only interval IDs when retrying after a reload", async () => {
    const client = await import("@/lib/messageQueue");
    const schedule = { kind: "custom" as const, date: "2090-01-01", time: "10:00", intervals: [{ id: "first-ui-id", days: 7, count: 4 }] };
    rpc.mockRejectedValueOnce(new Error("Network"));
    await expect(client.enqueueMessages(ids,"Oi",schedule,"composer")).rejects.toThrow();
    const original = rpc.mock.calls[0][1]._request_id;
    const reloaded = await import("@/lib/messageQueue");
    const updatedSchedule = { ...schedule, intervals: [{ id: "new-ui-id", days: 7, count: 4 }] };
    await reloaded.enqueueMessages(ids,"Oi", updatedSchedule,"composer");
    expect(rpc.mock.calls[1][1]._request_id).toBe(original);
    expect(rpc.mock.calls[1][1]._schedule.intervals).toEqual([{ days: 7, count: 4 }]);
  });
  it("keeps separate identities for edits while preserving the original retry", async () => {
    const client = await import("@/lib/messageQueue");
    rpc.mockRejectedValueOnce(new Error("Network"));
    await expect(client.enqueueMessages(ids,"Original",{ kind: "now" },"composer")).rejects.toThrow();
    const original = rpc.mock.calls[0][1]._request_id;
    await client.enqueueMessages(ids,"Edited",{ kind: "now" },"composer");
    expect(rpc.mock.calls[1][1]._request_id).not.toBe(original);
    await client.enqueueMessages(ids,"Original",{ kind: "now" },"composer");
    expect(rpc.mock.calls[2][1]._request_id).toBe(original);
  });
  it("allows a deliberate second submission after a confirmed success", async () => {
    const client = await import("@/lib/messageQueue");
    await client.enqueueMessages(ids,"Oi",{ kind: "now" },"composer");
    await client.enqueueMessages(ids,"Oi",{ kind: "now" },"composer");
    expect(rpc.mock.calls[0][1]._request_id).not.toBe(rpc.mock.calls[1][1]._request_id);
  });
  it("requires a signed-in account", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const client = await import("@/lib/messageQueue");
    await expect(client.enqueueMessages(ids,"Oi",{ kind: "now" },"composer")).rejects.toThrow("Entre novamente");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("retains the ID when the returned receipt is malformed", async () => {
    const client = await import("@/lib/messageQueue");
    rpc.mockResolvedValueOnce({ data: { queued: "1", replayed: false }, error: null });
    await expect(client.enqueueMessages(ids,"Oi",{ kind: "now" },"composer")).rejects.toThrow("inválida");
    expect(storage.size).toBe(1);
  });
});
