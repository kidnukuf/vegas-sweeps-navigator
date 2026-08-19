import { describe, expect, it } from "vitest";
import { normalizeCoordinatorContactDetails } from "./coordinatorContactLogic";

describe("coordinator contact normalization", () => {
  it("trims contact details and removes blank values", () => {
    expect(normalizeCoordinatorContactDetails(" 555-0100 ", " COORDINATOR@Example.com ")).toEqual({ phone: "555-0100", email: "coordinator@example.com" });
    expect(normalizeCoordinatorContactDetails(" ", " ")).toEqual({ phone: null, email: null });
  });
});
