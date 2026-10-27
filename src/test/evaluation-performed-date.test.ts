import { performedDateLabel, validPerformedDate } from "@/lib/evaluationPerformedDate";
import { describe, expect, it } from "vitest";

describe("actual evaluation date", () => {
  it("accepts a calendar day through today in Brasília, without shifting it to UTC", () => {
    const now = new Date("2026-10-19T01:00:00Z");
    expect(validPerformedDate("2026-10-18", now)).toBe(true);
    expect(validPerformedDate("2026-10-19", now)).toBe(false);
    expect(performedDateLabel("2026-10-18")).toBe("18/10/2026");
  });
  it("rejects missing, rolled-over, malformed and infinite dates", () => {
    for (const date of ["", "infinity", "2026-02-30", "2026-13-01", "26-01-01", "2026-1-1"]) {
      expect(validPerformedDate(date, new Date("2026-10-18T15:00:00Z"))).toBe(false);
    }
    expect(validPerformedDate("2024-02-29", new Date("2026-10-18T15:00:00Z"))).toBe(true);
  });
});
