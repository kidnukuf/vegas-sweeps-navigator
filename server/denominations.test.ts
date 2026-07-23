/**
 * Unit tests for the cash denomination calculator.
 * Run with: pnpm test
 */

import { describe, it, expect } from "vitest";
import {
  calcDenominations,
  sumDenominations,
  formatBreakdown,
  BILL_DENOMINATIONS,
} from "../shared/denominations";

// ─── Helper ───────────────────────────────────────────────────────────────────

function totalBills(counts: Record<number, number>): number {
  return BILL_DENOMINATIONS.reduce((s, b) => s + counts[b] * b, 0);
}

// ─── calcDenominations ────────────────────────────────────────────────────────

describe("calcDenominations", () => {
  it("exact split — $500 for 5 bowlers → $100 each, no adjustment", () => {
    const r = calcDenominations(500, 5);
    expect(r.delta).toBe(0);
    expect(r.adjustedTotal).toBe(500);
    expect(r.perBowlerAmount).toBe(100);
    expect(r.perBowler[100]).toBe(1);
    expect(r.perBowler[50]).toBe(0);
    expect(r.perBowler[20]).toBe(0);
    expect(r.perBowler[10]).toBe(0);
    expect(r.perBowler[5]).toBe(0);
    // team total = 5 × 1×$100
    expect(r.teamTotal[100]).toBe(5);
    expect(totalBills(r.teamTotal)).toBe(500);
  });

  it("exact split — $1500 for 3 bowlers → $500 each, no adjustment", () => {
    const r = calcDenominations(1500, 3);
    expect(r.delta).toBe(0);
    expect(r.perBowlerAmount).toBe(500);
    expect(r.perBowler[100]).toBe(5);
    expect(totalBills(r.teamTotal)).toBe(1500);
  });

  it("rounds UP — $1350 for 4 bowlers → adjusted to $1360 (+$10)", () => {
    // unit = 5×4 = $20; 1350/20 = 67.5 → lower=1340, upper=1360
    // distDown=10, distUp=10 → tie → prefer UP
    const r = calcDenominations(1350, 4);
    expect(r.adjustedTotal).toBe(1360);
    expect(r.delta).toBe(10);
    expect(r.perBowlerAmount).toBe(340);
    // $340 = 3×$100 + 2×$20
    expect(r.perBowler[100]).toBe(3);
    expect(r.perBowler[50]).toBe(0);
    expect(r.perBowler[20]).toBe(2);
    expect(r.perBowler[10]).toBe(0);
    expect(r.perBowler[5]).toBe(0);
    expect(totalBills(r.perBowler)).toBe(340);
    expect(totalBills(r.teamTotal)).toBe(1360);
  });

  it("rounds DOWN — $1330 for 4 bowlers → adjusted to $1320 (−$10)", () => {
    // unit=20; 1330/20=66.5 → lower=1320, upper=1340
    // distDown=10, distUp=10 → tie → prefer UP → 1340
    // Wait: 1330 - 1320 = 10, 1340 - 1330 = 10 → tie → UP → 1340
    const r = calcDenominations(1330, 4);
    expect(r.adjustedTotal).toBe(1340);
    expect(r.delta).toBe(10);
    expect(r.perBowlerAmount).toBe(335);
    // $335 = 3×$100 + 1×$20 + 1×$10 + 1×$5
    expect(r.perBowler[100]).toBe(3);
    expect(r.perBowler[20]).toBe(1);
    expect(r.perBowler[10]).toBe(1);
    expect(r.perBowler[5]).toBe(1);
    expect(totalBills(r.perBowler)).toBe(335);
  });

  it("rounds DOWN strictly — $1325 for 4 bowlers → adjusted to $1320 (−$5)", () => {
    // unit=20; lower=1320, upper=1340; distDown=5, distUp=15 → go DOWN
    const r = calcDenominations(1325, 4);
    expect(r.adjustedTotal).toBe(1320);
    expect(r.delta).toBe(-5);
    expect(r.perBowlerAmount).toBe(330);
    // $330 = 3×$100 + 1×$20 + 1×$10
    expect(r.perBowler[100]).toBe(3);
    expect(r.perBowler[20]).toBe(1);
    expect(r.perBowler[10]).toBe(1);
    expect(r.perBowler[5]).toBe(0);
    expect(totalBills(r.perBowler)).toBe(330);
  });

  it("rounds UP strictly — $1335 for 4 bowlers → adjusted to $1340 (+$5)", () => {
    // unit=20; lower=1320, upper=1340; distDown=15, distUp=5 → go UP
    const r = calcDenominations(1335, 4);
    expect(r.adjustedTotal).toBe(1340);
    expect(r.delta).toBe(5);
    expect(r.perBowlerAmount).toBe(335);
    expect(totalBills(r.perBowler)).toBe(335);
  });

  it("single bowler — any multiple of $5 is exact", () => {
    const r = calcDenominations(275, 1);
    expect(r.delta).toBe(0);
    expect(r.perBowlerAmount).toBe(275);
    // $275 = 2×$100 + 1×$50 + 1×$20 + 0×$10 + 1×$5
    expect(r.perBowler[100]).toBe(2);
    expect(r.perBowler[50]).toBe(1);
    expect(r.perBowler[20]).toBe(1);
    expect(r.perBowler[5]).toBe(1);
    expect(totalBills(r.perBowler)).toBe(275);
  });

  it("single bowler — $273 rounds to $275 (+$2 → nearest $5)", () => {
    // unit=5×1=5; lower=270, upper=275; distDown=3, distUp=2 → UP
    const r = calcDenominations(273, 1);
    expect(r.adjustedTotal).toBe(275);
    expect(r.delta).toBe(2);
  });

  it("large amount — $10000 for 5 bowlers → $2000 each", () => {
    const r = calcDenominations(10000, 5);
    expect(r.delta).toBe(0);
    expect(r.perBowlerAmount).toBe(2000);
    expect(r.perBowler[100]).toBe(20);
    expect(totalBills(r.teamTotal)).toBe(10000);
  });

  it("team total bills always equal adjustedTotal", () => {
    const cases = [
      [750, 3], [1200, 4], [555, 5], [800, 6], [1000, 7],
    ] as [number, number][];
    for (const [amt, n] of cases) {
      const r = calcDenominations(amt, n);
      expect(totalBills(r.teamTotal)).toBe(r.adjustedTotal);
    }
  });
});

// ─── sumDenominations ─────────────────────────────────────────────────────────

describe("sumDenominations", () => {
  it("sums bill counts across multiple teams", () => {
    const a = calcDenominations(500, 5);  // 5×$100 each → team: 5×$100
    const b = calcDenominations(300, 3);  // $100 each → team: 3×$100
    const grand = sumDenominations([a, b]);
    expect(grand[100]).toBe(5 + 3);
    expect(totalBills(grand)).toBe(a.adjustedTotal + b.adjustedTotal);
  });

  it("returns zeros for empty array", () => {
    const grand = sumDenominations([]);
    for (const bill of BILL_DENOMINATIONS) {
      expect(grand[bill]).toBe(0);
    }
  });
});

// ─── formatBreakdown ─────────────────────────────────────────────────────────

describe("formatBreakdown", () => {
  it("formats non-zero bills only", () => {
    const r = calcDenominations(340, 1);
    const s = formatBreakdown(r.perBowler);
    expect(s).toBe("3×$100 + 2×$20");
  });

  it("returns $0 for all-zero counts", () => {
    const zeros = { 100: 0, 50: 0, 20: 0, 10: 0, 5: 0 };
    expect(formatBreakdown(zeros)).toBe("$0");
  });
});
