import { describe, expect, it } from "vitest";
import { assessOwnerReadiness } from "./ownerDashboardLogic";

const completeMetrics = {
  bowlers: 4,
  hasSheet: true,
  hasTab: true,
  missingCenters: 0,
  missingIds: 0,
  missingBanquetPasses: 0,
  missingPoolPasses: 0,
  missingClaimCodes: 0,
  unmatchedBowlers: 0,
  hasBanquetDetails: true,
  assignedDirectors: 1,
};

describe("assessOwnerReadiness", () => {
  it("marks a fully configured event ready", () => {
    expect(assessOwnerReadiness(completeMetrics)).toEqual({
      level: "ready",
      issues: ["Ready for operations"],
    });
  });

  it("blocks events whose sheet routing or roster identity is invalid", () => {
    const result = assessOwnerReadiness({
      ...completeMetrics,
      hasTab: false,
      missingCenters: 2,
      unmatchedBowlers: 1,
    });
    expect(result.level).toBe("blocked");
    expect(result.issues).toContain("Google Sheet target is incomplete");
    expect(result.issues).toContain("2 bowlers missing a center");
  });

  it("keeps fixable configuration gaps in the attention state", () => {
    const result = assessOwnerReadiness({
      ...completeMetrics,
      missingClaimCodes: 3,
      assignedDirectors: 0,
    });
    expect(result.level).toBe("attention");
    expect(result.issues).toContain("3 missing claim codes");
    expect(result.issues).toContain("No Event Director assigned");
  });
});
