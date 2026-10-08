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
});
