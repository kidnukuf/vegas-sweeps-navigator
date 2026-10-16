import { describe, expect, it } from "vitest";
import { isPoolPartyVisible } from "./eventVisibility";

describe("event portal visibility", () => {
  it("hides pool-party content for the November event", () => {
    expect(isPoolPartyVisible(3960003, "B.O.B. November")).toBe(false);
    expect(isPoolPartyVisible(3960003, "Different event name")).toBe(false);
    expect(isPoolPartyVisible(null, "B.O.B. November")).toBe(false);
  });

  it("leaves other events visible when their settings enable pool party", () => {
    expect(isPoolPartyVisible(1234567, "B.O.B. December")).toBe(true);
    expect(isPoolPartyVisible(null, "Funtime Team Challenge 2026")).toBe(true);
  });
});
