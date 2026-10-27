import { fetchMessageReviewQueue } from "@/lib/messageReviewQueue";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ rows: [] as { id: string; student_id: string; status: string; scheduled_for: string; dispatch_started_at?: string | null }[], filters: vi.fn(), ranges: vi.fn(), failure: false, missingCount: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const filters: ((row: typeof fixture.rows[number]) => boolean)[] = [];
  const chain = {
    select: () => chain,
    in: (key: "student_id" | "status", values: string[]) => { fixture.filters(key, values); filters.push(row => values.includes(row[key])); return chain; },
    or: (expression: string) => { fixture.filters("or", expression); filters.push(row => ["pending", "processing", "uncertain"].includes(row.status) || row.status === "failed" && !!row.dispatch_started_at); return chain; },
    order: () => chain,
    range: async (from: number, to: number) => {
      fixture.ranges(from, to);
      const rows = fixture.rows.filter(row => filters.every(filter => filter(row)));
      return { data: rows.slice(from, to + 1), count: fixture.missingCount ? null : rows.length, error: fixture.failure ? { message: "offline" } : null };
    },
  };
  return chain;
} } }));
beforeEach(() => { vi.clearAllMocks(); fixture.rows = []; fixture.failure = false; fixture.missingCount = false; });

it("does not query an empty selection", async () => {
  expect(await fetchMessageReviewQueue([])).toEqual([]);
  expect(fixture.ranges).not.toHaveBeenCalled();
});
it("reads all pages and excludes sent, failed and other students", async () => {
  fixture.rows = Array.from({ length: 501 }, (_, index) => ({ id: String(index), student_id: "a", status: "pending", scheduled_for: "2026-10-20T15:00:00Z" }));
  fixture.rows.push({ id: "sent", student_id: "a", status: "sent", scheduled_for: "2026-10-20T15:00:00Z" }, { id: "other", student_id: "b", status: "pending", scheduled_for: "2026-10-20T15:00:00Z" });
  expect(await fetchMessageReviewQueue(["a", "a"])).toHaveLength(501);
  expect(fixture.ranges.mock.calls).toEqual([[0, 499], [500, 999]]);
  expect(fixture.filters).toHaveBeenCalledWith("or", "status.in.(pending,processing,uncertain),and(status.eq.failed,dispatch_started_at.not.is.null)");
});
it("batches recipient IDs to avoid excessive REST URL length", async () => {
  await fetchMessageReviewQueue(Array.from({ length: 201 }, (_, index) => String(index)));
  expect(fixture.ranges).toHaveBeenCalledTimes(3);
  expect(fixture.filters.mock.calls.filter(([key]) => key === "student_id").map(([, ids]) => ids.length)).toEqual([100, 100, 1]);
});
it("includes ambiguous worker failures but excludes definite failures without a dispatch marker", async () => {
  fixture.rows = [
    { id: "ambiguous", student_id: "a", status: "failed", dispatch_started_at: "2026-10-20T15:00:00Z", scheduled_for: "2026-10-20T15:00:00Z" },
    { id: "definite", student_id: "a", status: "failed", dispatch_started_at: null, scheduled_for: "2026-10-20T15:00:00Z" },
  ];
  expect((await fetchMessageReviewQueue(["a"])).map(row => row.id)).toEqual(["ambiguous"]);
});
it("reports failures and missing counts instead of claiming an empty queue", async () => {
  fixture.failure = true;
  await expect(fetchMessageReviewQueue(["a"])).rejects.toThrow("offline");
  fixture.failure = false; fixture.missingCount = true;
  await expect(fetchMessageReviewQueue(["a"])).rejects.toThrow("quantidade");
});
