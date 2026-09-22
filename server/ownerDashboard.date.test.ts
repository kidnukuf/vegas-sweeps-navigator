import { describe, expect, it } from "vitest";
import { normalizeOwnerEventDate } from "./routers/ownerDashboard";

describe("normalizeOwnerEventDate", () => {
  it("converts the Owner Portal MM/DD/YYYY format to MySQL DATE format", () => {
    expect(normalizeOwnerEventDate("10/06/2026", "Start date")).toBe("2026-10-06");
    expect(normalizeOwnerEventDate("1/8/2027", "End date")).toBe("2027-01-08");
  });

  it("keeps ISO dates usable when an existing event is edited", () => {
    expect(normalizeOwnerEventDate("2026-10-06", "Start date")).toBe("2026-10-06");
  });

  it("returns null for an empty optional date", () => {
    expect(normalizeOwnerEventDate("  ", "Start date")).toBeNull();
    expect(normalizeOwnerEventDate(null, "End date")).toBeNull();
  });

  it("rejects malformed and impossible calendar dates", () => {
    expect(() => normalizeOwnerEventDate("10/06/26", "Start date")).toThrow("MM/DD/YYYY");
    expect(() => normalizeOwnerEventDate("02/29/2026", "Start date")).toThrow("valid calendar date");
  });
});
