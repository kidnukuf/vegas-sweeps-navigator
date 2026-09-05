import { describe, expect, it } from "vitest";
import { isIncompleteGuestName, normalizeGuestName, splitImportedGuestEntry } from "./guestInformation.logic";

describe("guest information completion logic", () => {
  it("flags blank, numeric, and currency-style entries as incomplete guest information", () => {
    expect(isIncompleteGuestName(null)).toBe(true);
    expect(isIncompleteGuestName("  ")).toBe(true);
    expect(isIncompleteGuestName("80")).toBe(true);
    expect(isIncompleteGuestName("$80.00")).toBe(true);
  });

  it("preserves legitimate person names for portal display", () => {
    expect(isIncompleteGuestName("Jordan Smith")).toBe(false);
    expect(normalizeGuestName("  Jordan   Smith  ")).toBe("Jordan Smith");
  });

  it("moves imported numeric guest entries into the recorded-amount field", () => {
    expect(splitImportedGuestEntry("$80.00")).toEqual({ guestName: null, guestAmountPaid: "$80.00" });
    expect(splitImportedGuestEntry("Jordan Smith")).toEqual({ guestName: "Jordan Smith", guestAmountPaid: null });
  });
});
