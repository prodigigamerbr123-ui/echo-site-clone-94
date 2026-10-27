import { buildMessageReview, reviewRecipientsUnchanged } from "@/lib/messageReview";
import { replaceNameVar } from "@/lib/phone";
import { describe, expect, it } from "vitest";

const students = [
  { id: "a", name: "Ana", phone: "43999990000", had_evaluation: false, messages_enabled: true, status: "active" },
  { id: "b", name: "Bruno", phone: "+55 (43) 99999-0000", had_evaluation: false, messages_enabled: true, status: "inactive" },
];
const now = new Date("2026-10-18T12:00:00Z");

describe("message review", () => {
  it("counts overlapping recurrence dates once per student, including the first message", () => {
    const review = buildMessageReview(students, "Olá {nome}", { kind: "custom", date: "2026-10-20", time: "10:00", intervals: [{ days: 7, count: 4 }, { days: 14, count: 2 }] }, now);
    expect(review.total).toBe(10);
    expect(review.perStudent).toBe(5);
    expect(review.dates).toHaveLength(5);
    expect(review.dates[0]).toBe("2026-10-20T13:00:00.000Z");
    expect(review.sharedPhones).toEqual([["Ana", "Bruno"]]);
    expect(review.inactive).toBe(1);
  });
  it("captures an independent snapshot and detects changed contact details", () => {
    const recipients = students.map(student => ({ ...student }));
    const review = buildMessageReview(recipients, " Oi ", { kind: "now" }, now);
    expect(reviewRecipientsUnchanged(review, recipients)).toBe(true);
    recipients[0].phone = "43999991111";
    expect(review.recipients[0].phone).toBe("43999990000");
    expect(reviewRecipientsUnchanged(review, recipients)).toBe(false);
    expect(reviewRecipientsUnchanged(review, [])).toBe(false);
  });
  it("rejects disabled contact, invalid phone, invalid schedules and excessive batches", () => {
    expect(() => buildMessageReview([{ ...students[0], messages_enabled: false }], "Oi", { kind: "now" }, now)).toThrow("desativadas");
    expect(() => buildMessageReview([{ ...students[0], phone: "000" }], "Oi", { kind: "now" }, now)).toThrow("telefone");
    expect(() => buildMessageReview(students, "Oi", { kind: "custom", date: "2026-10-17", time: "10:00", intervals: [] }, now)).toThrow("futura");
    const many = Array.from({ length: 500 }, (_, index) => ({ ...students[0], id: String(index) }));
    expect(() => buildMessageReview(many, "Oi", { kind: "custom", date: "2026-10-20", time: "10:00", intervals: [{ days: 7, count: 11 }] }, now)).toThrow("5000");
  });
  it("validates personalized length and treats replacement characters in names as literal data", () => {
    expect(() => buildMessageReview([{ ...students[0], name: "A".repeat(30) }], "x".repeat(980) + "{nome}", { kind: "now" }, now)).toThrow("1000");
    expect(buildMessageReview([{ ...students[0], name: "$&" }], "{nome}", { kind: "now" }, now).total).toBe(1);
    expect(replaceNameVar("Olá {nome}", "Ana $&")).toBe("Olá Ana $&");
  });
});
