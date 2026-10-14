import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEvolutionText } from "../../supabase/functions/_shared/evolution";

afterEach(() => vi.unstubAllGlobals());

describe("provider response sanitization", () => {
  it.each([200, 503])("does not return the provider body at HTTP %s", async (status) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { connected: true, loggedIn: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: status === 503 ? "private-provider-marker" : undefined,
        data: { Info: { ID: status === 200 ? "message-id" : undefined }, token: "private-provider-marker" },
      }), { status }));
    vi.stubGlobal("fetch", fetch);
    const result = await sendEvolutionText({ baseUrl: "http://fixture", instanceToken: "test-token", number: "5543999999999", text: "Teste" });
    expect(result.ok).toBe(status === 200);
    expect(JSON.stringify(result)).not.toContain("private-provider-marker");
    expect(result).not.toHaveProperty("bodyText");
    if (status === 503) expect(result.uncertain).toBe(true);
  });
});
