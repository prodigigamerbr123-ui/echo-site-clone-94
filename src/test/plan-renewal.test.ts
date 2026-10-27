import { describe, expect, it } from "vitest";
import { suggestedRenewalDate, validCalendarDate } from "@/lib/planRenewal";

describe("plan renewal date suggestions", () => {
  it("uses a future due date as the next period's anchor", () => {
    expect(suggestedRenewalDate("Mensal", "2026-11-12", "2026-10-18")).toBe("2026-12-12");
    expect(suggestedRenewalDate("Trimestral", "2026-12-12", "2026-10-18")).toBe("2027-03-12");
  });
  it("starts from today for an overdue or absent due date", () => {
    expect(suggestedRenewalDate("Mensal", "2026-09-30", "2026-10-18")).toBe("2026-11-18");
    expect(suggestedRenewalDate("Semestral", null, "2026-10-18")).toBe("2027-04-18");
  });
  it("clamps end of month and leap years without timezone changes", () => {
    expect(suggestedRenewalDate("Mensal", "2027-01-31", "2026-10-18")).toBe("2027-02-28");
    expect(suggestedRenewalDate("Mensal", "2028-01-31", "2026-10-18")).toBe("2028-02-29");
    expect(suggestedRenewalDate("Anual", "2028-02-29", "2026-10-18")).toBe("2029-02-28");
  });
  it("demands a manual date for legacy discounts and rejects impossible dates", () => {
    expect(suggestedRenewalDate("Desconto especial", "2026-11-10", "2026-10-18")).toBeNull();
    expect(validCalendarDate("2026-02-29")).toBe(false);
    expect(validCalendarDate("2028-02-29")).toBe(true);
    expect(validCalendarDate("2026-13-10")).toBe(false);
  });
});
