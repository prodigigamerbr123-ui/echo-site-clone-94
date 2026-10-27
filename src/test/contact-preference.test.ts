import { diagnosticContactBlocked } from "../../supabase/functions/_shared/contactPreference";
import { describe, expect, it, vi } from "vitest";

describe("diagnostic contact preference", () => {
  it("normalizes national and formatted phones before matching", async () => {
    const page = vi.fn().mockResolvedValue({ data: [{ phone: "(43) 99999-0000" }], error: null });
    expect(await diagnosticContactBlocked("5543999990000", page)).toBe(true);
    expect(page).toHaveBeenCalledWith(0, 999);
  });
  it("checks beyond a REST page and preserves shared-phone refusals", async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({ phone: "43988880000" })), error: null })
      .mockResolvedValueOnce({ data: [{ phone: "+55 43 99999-0000" }], error: null });
    expect(await diagnosticContactBlocked("5543999990000", page)).toBe(true);
    expect(page).toHaveBeenCalledWith(1000, 1999);
  });
  it("allows an unknown phone only after a complete successful read", async () => {
    expect(await diagnosticContactBlocked("5543999990000", async () => ({ data: [], error: null }))).toBe(false);
  });
  it("fails closed when preference checks fail or return no data", async () => {
    for (const result of [{ data: null, error: null }, { data: null, error: new Error("offline") }]) {
      await expect(diagnosticContactBlocked("5543999990000", async () => result)).rejects.toThrow("preferência de contato");
    }
  });
});
