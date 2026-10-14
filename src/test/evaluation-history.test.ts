import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ range: vi.fn(), order: vi.fn(), select: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: mocks.select }),
} }));
import { fetchEvaluationHistory } from "@/lib/evaluationHistory";
beforeEach(() => {
  mocks.range.mockReset();
  const query = { order: mocks.order, range: mocks.range };
  mocks.order.mockReset().mockReturnValue(query);
  mocks.select.mockReset().mockReturnValue(query);
});
describe("complete evaluation history", () => {
  it("fetches more than the default REST cap with an exact count and stable tie breaker", async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id: String(id) }));
    mocks.range.mockImplementation(async (from, to) => ({ data: rows.slice(from, to + 1), count: rows.length, error: null }));
    expect(await fetchEvaluationHistory()).toHaveLength(1201);
    expect(mocks.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(mocks.select.mock.calls[0][1]).toEqual({ count: "exact" });
    expect(mocks.order).toHaveBeenCalledWith("id");
  });
  it("refuses a partial history when a later page fails", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), count: 600, error: null })
      .mockResolvedValueOnce({ data: null, count: null, error: { message: "unavailable" } });
    await expect(fetchEvaluationHistory()).rejects.toThrow("unavailable");
  });
});
