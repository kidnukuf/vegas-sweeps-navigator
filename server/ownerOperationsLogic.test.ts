import { describe, expect, it } from "vitest";
import { normalizeEventIds, portfolioMatchesCompany } from "./ownerOperationsLogic";

describe("owner operations portfolio helpers", () => {
  it("removes duplicate and invalid event selections before assigning a director", () => {
    expect(normalizeEventIds([4, 4, 8, 0, -1, 2.5])).toEqual([4, 8]);
  });

  it("permits unassigned directors and only permits portfolios inside their company", () => {
    expect(portfolioMatchesCompany([], 7)).toBe(true);
    expect(portfolioMatchesCompany([7, 7], 7)).toBe(true);
    expect(portfolioMatchesCompany([7, 8], 7)).toBe(false);
  });
});
