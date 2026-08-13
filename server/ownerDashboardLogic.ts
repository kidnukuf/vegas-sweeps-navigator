export type OwnerReadinessMetrics = {
  bowlers: number;
  hasSheet: boolean;
  hasTab: boolean;
  missingCenters: number;
  missingIds: number;
  missingBanquetPasses: number;
  missingPoolPasses: number;
  missingClaimCodes: number;
  unmatchedBowlers: number;
  hasBanquetDetails: boolean;
  assignedDirectors: number;
};

export type OwnerReadiness = {
  level: "ready" | "attention" | "blocked";
  issues: string[];
};

/** Produces a non-destructive, prioritized owner-facing readiness assessment. */
export function assessOwnerReadiness(metrics: OwnerReadinessMetrics): OwnerReadiness {
  const blocked: string[] = [];
  const attention: string[] = [];

  if (!metrics.hasSheet || !metrics.hasTab) blocked.push("Google Sheet target is incomplete");
  if (metrics.missingCenters > 0) blocked.push(`${metrics.missingCenters} bowler${metrics.missingCenters === 1 ? "" : "s"} missing a center`);
  if (metrics.unmatchedBowlers > 0) blocked.push(`${metrics.unmatchedBowlers} unmatched bowler${metrics.unmatchedBowlers === 1 ? "" : "s"}`);

  if (metrics.bowlers === 0) attention.push("No roster imported");
  if (metrics.missingIds > 0) attention.push(`${metrics.missingIds} missing Bowler ID${metrics.missingIds === 1 ? "" : "s"}`);
  if (metrics.missingBanquetPasses > 0) attention.push(`${metrics.missingBanquetPasses} missing banquet pass${metrics.missingBanquetPasses === 1 ? "" : "es"}`);
  if (metrics.missingPoolPasses > 0) attention.push(`${metrics.missingPoolPasses} missing pool pass${metrics.missingPoolPasses === 1 ? "" : "es"}`);
  if (metrics.missingClaimCodes > 0) attention.push(`${metrics.missingClaimCodes} missing claim code${metrics.missingClaimCodes === 1 ? "" : "s"}`);
  if (!metrics.hasBanquetDetails) attention.push("Banquet time or location is incomplete");
  if (metrics.assignedDirectors === 0) attention.push("No Event Director assigned");

  if (blocked.length > 0) return { level: "blocked", issues: [...blocked, ...attention] };
  if (attention.length > 0) return { level: "attention", issues: attention };
  return { level: "ready", issues: ["Ready for operations"] };
}
