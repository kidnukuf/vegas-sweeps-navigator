/**
 * Cash denomination calculator for team payouts.
 *
 * BILLS supported: $100, $50, $20, $10, $5
 * (No $1 bills — smallest denomination is $5)
 *
 * GOAL: Given a total payout amount and a team's bowler count, produce the
 * optimal bill breakdown such that every bowler receives the EXACT SAME mix
 * of bills (i.e. the per-bowler amount is divisible by $5 and the team total
 * is divisible by the per-bowler amount).
 *
 * ALGORITHM (even-split denomination):
 *
 * 1. The smallest denomination is $5, so the per-bowler share must be a
 *    multiple of $5.  The team total must therefore be a multiple of (5 × N)
 *    where N = bowler count.
 *
 * 2. Find the smallest adjustment (±$5 increments) needed to make the total
 *    evenly divisible by (5 × N).  Prefer rounding UP; if the upward
 *    adjustment equals the downward one, prefer up.
 *
 * 3. Divide the adjusted total by N to get the per-bowler amount.
 *
 * 4. Apply a greedy bill-break on the per-bowler amount using denominations
 *    [100, 50, 20, 10, 5] (largest first).
 *
 * 5. Multiply each per-bowler bill count by N to get the team-total bill
 *    counts.
 *
 * EXAMPLE — $1,350 for 4 bowlers:
 *   Step 1: unit = 5 × 4 = $20.  1350 / 20 = 67.5 → not integer.
 *   Step 2: nearest multiples of $20: 1340 (−$10) and 1360 (+$10).
 *           Prefer up → adjusted = $1,360, delta = +$10.
 *   Step 3: per bowler = 1360 / 4 = $340.
 *   Step 4: $340 = 3×$100 + 0×$50 + 2×$20 + 0×$10 + 0×$5.
 *   Step 5: team total = 12×$100 + 0×$50 + 8×$20 + 0×$10 + 0×$5 = $1,360.
 */

export const BILL_DENOMINATIONS = [100, 50, 20, 10, 5] as const;
export type BillDenomination = (typeof BILL_DENOMINATIONS)[number];

export interface DenominationBreakdown {
  /** Bill counts per bowler */
  perBowler: Record<BillDenomination, number>;
  /** Bill counts for the whole team (perBowler × bowlerCount) */
  teamTotal: Record<BillDenomination, number>;
  /** The (possibly adjusted) per-bowler dollar amount */
  perBowlerAmount: number;
  /** The (possibly adjusted) total payout amount */
  adjustedTotal: number;
  /** Difference from the original amount (positive = rounded up, negative = rounded down, 0 = exact) */
  delta: number;
  /** Number of bowlers used in the calculation */
  bowlerCount: number;
}

/**
 * Greedy bill-break for a single dollar amount (must be a multiple of $5).
 * Returns counts for each denomination.
 */
function breakIntoBills(amount: number): Record<BillDenomination, number> {
  const counts = { 100: 0, 50: 0, 20: 0, 10: 0, 5: 0 } as Record<BillDenomination, number>;
  let remaining = Math.round(amount); // work in whole dollars
  for (const bill of BILL_DENOMINATIONS) {
    counts[bill] = Math.floor(remaining / bill);
    remaining -= counts[bill] * bill;
  }
  // remaining should be 0 if amount was a multiple of $5
  return counts;
}

/**
 * Calculate the optimal even-split denomination breakdown.
 *
 * @param totalAmount  Raw payout amount in dollars (may be fractional cents).
 * @param bowlerCount  Number of bowlers on the team (must be ≥ 1).
 * @returns DenominationBreakdown with per-bowler and team-total bill counts,
 *          the adjusted total, and the delta from the original amount.
 */
export function calcDenominations(
  totalAmount: number,
  bowlerCount: number
): DenominationBreakdown {
  if (bowlerCount < 1) bowlerCount = 1;

  // Work in whole dollars (round input to nearest dollar first)
  const rawTotal = Math.round(totalAmount);

  // The smallest unit that satisfies "each bowler gets a multiple of $5"
  const unit = 5 * bowlerCount;

  // Find the nearest multiple of `unit` (prefer rounding up on ties)
  const lower = Math.floor(rawTotal / unit) * unit;
  const upper = lower + unit;

  let adjustedTotal: number;
  if (rawTotal === lower) {
    adjustedTotal = lower; // already exact
  } else {
    const distDown = rawTotal - lower;
    const distUp = upper - rawTotal;
    // Prefer up; only go down if strictly closer
    adjustedTotal = distDown < distUp ? lower : upper;
  }

  const delta = adjustedTotal - rawTotal;
  const perBowlerAmount = adjustedTotal / bowlerCount;

  const perBowler = breakIntoBills(perBowlerAmount);

  // Team total = per-bowler counts × N
  const teamTotal = {} as Record<BillDenomination, number>;
  for (const bill of BILL_DENOMINATIONS) {
    teamTotal[bill] = perBowler[bill] * bowlerCount;
  }

  return {
    perBowler,
    teamTotal,
    perBowlerAmount,
    adjustedTotal,
    delta,
    bowlerCount,
  };
}

/**
 * Sum denomination breakdowns across multiple teams to get the grand total
 * bill counts for the entire event.
 *
 * @param breakdowns  Array of DenominationBreakdown objects (one per team).
 * @returns           Summed bill counts across all teams.
 */
export function sumDenominations(
  breakdowns: DenominationBreakdown[]
): Record<BillDenomination, number> {
  const totals = { 100: 0, 50: 0, 20: 0, 10: 0, 5: 0 } as Record<BillDenomination, number>;
  for (const bd of breakdowns) {
    for (const bill of BILL_DENOMINATIONS) {
      totals[bill] += bd.teamTotal[bill];
    }
  }
  return totals;
}

/**
 * Format a denomination breakdown as a human-readable string.
 * e.g. "3×$100 + 1×$50 + 2×$20"  (zero-count bills omitted)
 */
export function formatBreakdown(counts: Record<BillDenomination, number>): string {
  const parts: string[] = [];
  for (const bill of BILL_DENOMINATIONS) {
    if (counts[bill] > 0) {
      parts.push(`${counts[bill]}×$${bill}`);
    }
  }
  return parts.length > 0 ? parts.join(" + ") : "$0";
}
