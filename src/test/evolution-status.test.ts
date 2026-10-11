// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEvolutionState, parseEvolutionStatus, sendEvolutionText } from "../../supabase/functions/_shared/evolution";

afterEach(() => vi.unstubAllGlobals());

describe("Evolution connection status", () => {
  it.each([
    [{ data: { Connected: true, LoggedIn: true } }, "open"],
    [{ data: { connected: true, loggedIn: true } }, "open"],
    [{ Connected: true, LoggedIn: false }, "connecting"],
    [{ connected: false, loggedIn: true }, "connecting"],
    [{ connected: false, loggedIn: false }, "close"],
    [{ Connected: false, connected: true, LoggedIn: true }, "connecting"],
  ])("interprets provider status %j as %s", (body, state) => {
    expect(parseEvolutionStatus(body).state).toBe(state);
    expect(parseEvolutionStatus(body).connected).toBe(state === "open");
  });

  it("preserves the account name in either response format", () => {
    expect(parseEvolutionStatus({ data: { Name: "Workout" } }).instance).toBe("Workout");
    expect(parseEvolutionStatus({ name: "Workout" }).instance).toBe("Workout");
  });

  it("does not treat failed authentication as a disconnected phone or send a message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getEvolutionState("https://example.test", "test-token")).toBe("unknown");
    const result = await sendEvolutionText({ baseUrl: "https://example.test", instanceToken: "test-token", number: "test", text: "test" });
    expect(result.ok).toBe(false);
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith("/instance/status"))).toBe(true);
  });

  it("returns unknown for an unavailable provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await getEvolutionState("https://example.test", "test-token")).toBe("unknown");
  });

  it.each([
    [200, JSON.stringify({ success: true }), true],
    [503, JSON.stringify({ error: "unavailable" }), true],
    [400, JSON.stringify({ error: "invalid number" }), false],
  ])("distinguishes uncertain delivery from rejection for HTTP %s", async (status, body, uncertain) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ Connected: true, LoggedIn: true })))
      .mockResolvedValueOnce(new Response(body, { status })));
    const result = await sendEvolutionText({ baseUrl: "https://example.test", instanceToken: "fake", number: "5543999999999", text: "Mensagem fictícia" });
    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(uncertain);
  });

  it("accepts only a provider response with a message identifier", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ Connected: true, LoggedIn: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { Info: { ID: "fake-provider-id" } } }))));
    const result = await sendEvolutionText({ baseUrl: "https://example.test", instanceToken: "fake", number: "5543999999999", text: "Mensagem fictícia" });
    expect(result).toMatchObject({ ok: true, messageId: "fake-provider-id" });
  });
});
