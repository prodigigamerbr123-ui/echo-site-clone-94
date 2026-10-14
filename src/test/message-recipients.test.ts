import { toggleVisibleRecipients } from "@/lib/messageRecipients";
import { describe, expect, it } from "vitest";

describe("bulk recipient selection across search results", () => {
  it("selects the visible students even when equally many different students are already selected", () => {
    expect(toggleVisibleRecipients(["ana"], ["bruno"])).toEqual(["ana", "bruno"]);
  });

  it("deselects only visible recipients and keeps hidden selections", () => {
    expect(toggleVisibleRecipients(["ana", "bruno"], ["bruno"])).toEqual(["ana"]);
  });

  it("retains selections when a search has no matches", () => {
    expect(toggleVisibleRecipients(["ana"], [])).toEqual(["ana"]);
  });
});
