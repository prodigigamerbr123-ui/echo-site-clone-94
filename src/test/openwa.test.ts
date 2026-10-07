import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOpenWaContacts,
  getOpenWaState,
} from "../../supabase/functions/_shared/openwa";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenWA compatibility", () => {
  it("uses isConnected with an empty JSON body on OpenWA v4", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, response: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getOpenWaState("https://openwa.test", "secret")).resolves.toBe("open");

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://openwa.test/isConnected",
      expect.objectContaining({
        method: "POST",
        body: "{}",
      }),
    );
  });

  it("uses an empty JSON body for getAllContacts", async () => {
    const contacts = [{ id: "5543999999999@c.us" }];
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, response: contacts }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getOpenWaContacts("https://openwa.test", "secret")).resolves.toEqual(contacts);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openwa.test/getAllContacts",
      expect.objectContaining({
        method: "POST",
        body: "{}",
      }),
    );
  });
});
