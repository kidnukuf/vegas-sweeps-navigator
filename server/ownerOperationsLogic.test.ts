import { describe, expect, it } from "vitest";
import { getOwnedEventIds, normalizeEventIds, portfolioMatchesCompany } from "./ownerOperationsLogic";

describe("owner operations portfolio helpers", () => {
  it("removes duplicate and invalid event selections before assigning a director", () => {
    expect(normalizeEventIds([4, 4, 8, 0, -1, 2.5])).toEqual([4, 8]);
  });

  it("permits unassigned directors and only permits portfolios inside their company", () => {
    expect(portfolioMatchesCompany([], 7)).toBe(true);
    expect(portfolioMatchesCompany([7, 7], 7)).toBe(true);
    expect(portfolioMatchesCompany([7, 8], 7)).toBe(false);
  });

  it("counts only events created by the selected Event Director", () => {
    const events = [
      { id: 10, createdByStaffId: 4 },
      { id: 11, createdByStaffId: 7 },
      { id: 12, createdByStaffId: 4 },
      { id: 13, createdByStaffId: null },
    ];
    expect(getOwnedEventIds(events, 4)).toEqual([10, 12]);
    expect(getOwnedEventIds(events, 7)).toEqual([11]);
    expect(getOwnedEventIds(events, 9)).toEqual([]);
  });
});
