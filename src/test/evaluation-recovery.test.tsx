import { webcrypto } from "node:crypto";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({
  user: "staff-a", row: null as null | Record<string, unknown>,
  rpc: vi.fn(), lookup: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: mocks.user } } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }),
  rpc: mocks.rpc,
} }));
vi.mock("@/lib/automationSettings", () => ({ fetchAutomationSettings: async () => ({}), isAutomationEnabled: () => false }));
vi.mock("@/lib/evaluationMessages", () => ({ buildEvaluationMessages: () => [], applyLinkedEvaluationTemplates: async () => {} }));

import { prepareEvaluationIntent, assertEvaluationIdentity } from "@/lib/evaluationIntent";
import { recoverEvaluationCreation, saveEvaluationWithMessages } from "@/lib/evaluationActions";
import { useEvaluationAgendaActions } from "@/hooks/useEvaluationAgendaActions";

const when = new Date("2090-01-02T12:00:00Z");
const args = ["student-a", "Aluno", when, "observação privada"] as const;
const success = (id: string, replay = false) => ({ evaluation_id: id, messages_created: replay ? 0 : 2, already_applied: replay, in_flight: 0 });
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  sessionStorage.clear();
  mocks.user = `staff-${crypto.randomUUID()}`;
  mocks.row = null;
  mocks.rpc.mockReset();
  mocks.lookup.mockReset().mockImplementation(async () => ({ data: mocks.row, error: null }));
  mocks.rpc.mockImplementation(async (name, payload) => name === "evaluation_schedule_conflicts"
    ? { data: { duplicate: null, conflict: null }, error: null }
    : { data: success(payload._evaluation_id, !!mocks.row), error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("evaluation creation recovery", () => {
  it("stores only an account-scoped digest and recovers the UUID after module reload", async () => {
    const first = await prepareEvaluationIntent(args[0], when, args[3]);
    expect(first.storageKey).toMatch(/:([a-f0-9]{64})$/);
    expect(JSON.stringify(sessionStorage)).not.toContain(args[3]);
    expect(first.storageKey).not.toContain(args[0]);
    vi.resetModules();
    const fresh = await import("@/lib/evaluationIntent");
    expect((await fresh.prepareEvaluationIntent(args[0], when, args[3])).id).toBe(first.id);
  });

  it("keeps the same UUID in memory when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const first = await prepareEvaluationIntent(args[0], when, args[3]);
    expect((await prepareEvaluationIntent(args[0], when, args[3])).id).toBe(first.id);
  });

  it("isolates accounts and refuses an operation if the active identity changed", async () => {
    const first = await prepareEvaluationIntent(args[0], when, args[3]);
    mocks.user = "another-staff";
    expect((await prepareEvaluationIntent(args[0], when, args[3])).id).not.toBe(first.id);
    await expect(assertEvaluationIdentity(first)).rejects.toThrow("sessão mudou");
  });

  it("reconciles a committed appointment after a lost response before the duplicate preflight", async () => {
    let loseResponse = true;
    mocks.rpc.mockImplementation(async (name, payload) => {
      if (name === "evaluation_schedule_conflicts") return { data: { duplicate: null, conflict: null }, error: null };
      if (loseResponse) {
        loseResponse = false;
        mocks.row = { id: payload._evaluation_id, student_id: args[0], scheduled_at: when.toISOString(), notes: args[3], status: "scheduled" };
        throw new Error("network response lost");
      }
      return { data: success(payload._evaluation_id, true), error: null };
    });
    const { result } = renderHook(useEvaluationAgendaActions, { wrapper });
    const approve = vi.fn(async () => false);
    await act(async () => { await expect(result.current.schedule(...args, undefined, approve)).rejects.toThrow("response lost"); });
    const firstId = mocks.row!.id;
    await act(async () => { expect((await result.current.schedule(...args, undefined, approve))?.already_applied).toBe(true); });
    expect(approve).toHaveBeenCalledTimes(1);
    const writes = mocks.rpc.mock.calls.filter(([name]) => name === "mutate_evaluation_tx");
    expect(writes.map(([, payload]) => payload._evaluation_id)).toEqual([firstId]);
    expect(sessionStorage.length).toBe(0);
  });

  it.each([{}, { ...success("wrong-id"), already_applied: false }])("retains its receipt after malformed or mismatched response %j", async (response) => {
    const intent = await prepareEvaluationIntent(args[0], when, args[3]);
    mocks.rpc.mockResolvedValue({ data: response, error: null });
    await expect(saveEvaluationWithMessages(...args, undefined, false, intent)).rejects.toThrow();
    expect(sessionStorage.getItem(intent.storageKey)).toBe(intent.id);
  });

  it("can recover an existing appointment whose scheduled time has already passed", async () => {
    const past = new Date("2020-01-01T12:00:00Z");
    const intent = await prepareEvaluationIntent(args[0], past, null);
    mocks.row = { id: intent.id, student_id: args[0], scheduled_at: past.toISOString(), notes: null, status: "scheduled" };
    expect((await recoverEvaluationCreation(intent, args[0], past, null))?.already_applied).toBe(true);
  });

  it("does not claim success if another operator changed the appointment", async () => {
    const intent = await prepareEvaluationIntent(args[0], when, args[3]);
    mocks.row = { id: intent.id, student_id: args[0], scheduled_at: when.toISOString(), notes: "alterada", status: "scheduled" };
    await expect(recoverEvaluationCreation(intent, args[0], when, args[3])).rejects.toThrow("foi alterada");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(intent.storageKey)).toBe(intent.id);
  });

  it("holds the synchronous lock throughout conflict confirmation and releases it after cancellation", async () => {
    const { result } = renderHook(useEvaluationAgendaActions, { wrapper });
    let release!: (value: null) => void;
    const approval = new Promise<null>(resolve => { release = resolve; });
    const approve = vi.fn(() => approval);
    let first!: ReturnType<typeof result.current.schedule>;
    await act(async () => { first = result.current.schedule(...args, undefined, approve); });
    expect(result.current.saving).toBe(true);
    await act(async () => { await expect(result.current.schedule(...args, undefined, approve)).rejects.toThrow("em andamento"); });
    await act(async () => { release(null); expect(await first).toBeNull(); });
    expect(result.current.saving).toBe(false);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "mutate_evaluation_tx")).toHaveLength(0);
  });

  it("refuses a create after the identity changes during confirmation", async () => {
    const { result } = renderHook(useEvaluationAgendaActions, { wrapper });
    await act(async () => {
      await expect(result.current.schedule(...args, undefined, async () => { mocks.user = "changed"; return true; })).rejects.toThrow("sessão mudou");
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "mutate_evaluation_tx")).toHaveLength(0);
  });

  it("also refuses rescheduling after identity changes during confirmation", async () => {
    const { result } = renderHook(useEvaluationAgendaActions, { wrapper });
    await act(async () => {
      await expect(result.current.schedule(...args, "existing-evaluation", async () => { mocks.user = "changed"; return true; })).rejects.toThrow("sessão mudou");
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "mutate_evaluation_tx")).toHaveLength(0);
  });

  it("fails closed on lookup failure and unlocks the form without losing the receipt", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: new Error("lookup unavailable") });
    const { result } = renderHook(useEvaluationAgendaActions, { wrapper });
    await act(async () => {
      await expect(result.current.schedule(...args, undefined, async () => false)).rejects.toThrow("lookup unavailable");
    });
    expect(result.current.saving).toBe(false);
    expect(sessionStorage.length).toBe(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("clears only a validated success and assigns a new UUID to a new deliberate request", async () => {
    const intent = await prepareEvaluationIntent(args[0], when, args[3]);
    await saveEvaluationWithMessages(...args, undefined, false, intent);
    expect(sessionStorage.getItem(intent.storageKey)).toBeNull();
    expect((await prepareEvaluationIntent(args[0], when, args[3])).id).not.toBe(intent.id);
  });
  it("preserves explicit null notes in the transaction contract", async () => {
    const result = await saveEvaluationWithMessages(args[0], args[1], when, null);
    expect(result.evaluation_id).toEqual(expect.any(String));
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_evaluation_tx", expect.objectContaining({ _notes: null }));
  });
});
