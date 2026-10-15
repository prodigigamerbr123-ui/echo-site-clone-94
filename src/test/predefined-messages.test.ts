import { beforeEach, describe, expect, it, vi } from "vitest";
import { deletePredefinedMessage, loadPredefinedMessages, savePredefinedMessage } from "@/lib/predefinedMessages";

const mocks = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), insert: vi.fn(), update: vi.fn(), remove: vi.fn(), ids: vi.fn() }));
vi.mock("@/lib/automationTemplateIds", () => ({ fetchAutomationTemplateIds: mocks.ids }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  select: () => ({ order: mocks.list, eq: () => ({ maybeSingle: mocks.read }) }),
  insert: (payload: unknown) => ({ select: () => ({ single: () => mocks.insert(payload) }) }),
  update: (payload: unknown) => ({ eq: (_key: string, id: string) => ({
    select: () => ({ maybeSingle: () => mocks.update(id, payload) }),
  }) }),
  delete: () => ({ eq: (_key: string, id: string) => ({ select: () => ({ maybeSingle: () => mocks.remove(id) }) }) }),
}) } }));
const message = { id: "fixture-id", title: "Boas-vindas", content: "Olá {nome}", created_at: "2026-10-15T12:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ data: [message], error: null });
  mocks.ids.mockResolvedValue(new Set([message.id]));
  mocks.insert.mockResolvedValue({ data: message, error: null });
  mocks.update.mockResolvedValue({ data: message, error: null });
  mocks.remove.mockResolvedValue({ data: { id: message.id }, error: null });
});

describe("confirmed predefined message operations", () => {
  it("loads models together with their automation links", async () => {
    expect(await loadPredefinedMessages()).toEqual({ messages: [message], automationIds: new Set([message.id]) });
  });
  it("does not report query failure as an empty collection", async () => {
    mocks.list.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(loadPredefinedMessages()).rejects.toThrow("offline");
  });
  it("does not classify automation models as manual when links fail", async () => {
    mocks.ids.mockRejectedValue(new Error("links unavailable"));
    await expect(loadPredefinedMessages()).rejects.toThrow("links unavailable");
  });
  it("uses the form identity and trimmed values when creating", async () => {
    await savePredefinedMessage(message.id, { title: " Boas-vindas ", content: " Olá {nome} " }, false);
    expect(mocks.insert).toHaveBeenCalledWith({ id: message.id, title: message.title, content: message.content });
  });
  it("recovers the exact same creation after a response was lost", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505" } });
    mocks.read.mockResolvedValue({ data: message, error: null });
    expect(await savePredefinedMessage(message.id, message, false)).toEqual(message);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("never overwrites different content on a repeated creation", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505" } });
    mocks.read.mockResolvedValue({ data: { ...message, content: "Outra mensagem" }, error: null });
    await expect(savePredefinedMessage(message.id, message, false)).rejects.toThrow("tentativa anterior");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects an update that affected no row", async () => {
    mocks.update.mockResolvedValue({ data: null, error: null });
    await expect(savePredefinedMessage(message.id, message, true)).rejects.toThrow("não está mais disponível");
  });
  it("rejects a delete that affected no row", async () => {
    mocks.remove.mockResolvedValue({ data: null, error: null });
    await expect(deletePredefinedMessage(message.id)).rejects.toThrow("não está mais disponível");
  });
  it("confirms a deletion by the row returned", async () => {
    await deletePredefinedMessage(message.id);
    expect(mocks.remove).toHaveBeenCalledWith(message.id);
  });
  it("rejects invalid field lengths before a write", async () => {
    await expect(savePredefinedMessage(message.id, { title: "x".repeat(101), content: "Olá" }, false)).rejects.toThrow("limites");
    await expect(savePredefinedMessage(message.id, { title: "Título", content: "x".repeat(1001) }, false)).rejects.toThrow("limites");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
