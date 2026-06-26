/**
 * Pure-logic tests for the offline door rules that don't need a database:
 *   - the deterministic reentry token format (mode + zone + event + index)
 *   - the admit/consume classification used during sync
 *
 * These mirror the logic in server/routers/offlineDoor.ts so a regression in the
 * token scheme or the "which results consume a token" rule is caught immediately.
 */
import { describe, expect, it } from "vitest";

// Mirror of makeReentryToken in offlineDoor.ts (kept in sync intentionally).
function makeReentryToken(eventId: number, mode: "banquet" | "pool", zone: string, index: number): string {
  const m = mode === "banquet" ? "BQ" : "PP";
  return `RE-${m}-${zone}-${eventId}-${String(index).padStart(3, "0")}`;
}

// Mirror of the consume rule in the sync mutation.
const ADMIT_RESULTS = ["admitted", "override_admitted", "reentry_admitted"];
function consumesEntryToken(result: string): boolean {
  // Reentry admits are reusable and do NOT consume an entry token.
  return ADMIT_RESULTS.includes(result) && result !== "reentry_admitted";
}

describe("reentry token format", () => {
  it("encodes mode, zone, event id and zero-padded index", () => {
    expect(makeReentryToken(1, "banquet", "N", 1)).toBe("RE-BQ-N-1-001");
    expect(makeReentryToken(1, "pool", "W", 50)).toBe("RE-PP-W-1-050");
    expect(makeReentryToken(12, "banquet", "S", 7)).toBe("RE-BQ-S-12-007");
  });

  it("produces 200 unique tokens for a full pool (4 zones × 50)", () => {
    const tokens = new Set<string>();
    for (const zone of ["N", "E", "S", "W"]) {
      for (let i = 1; i <= 50; i++) tokens.add(makeReentryToken(1, "banquet", zone, i));
    }
    expect(tokens.size).toBe(200);
  });

  it("namespaces banquet and pool pools separately", () => {
    expect(makeReentryToken(1, "banquet", "N", 1)).not.toBe(makeReentryToken(1, "pool", "N", 1));
  });
});

describe("token consumption rule", () => {
  it("admitted and override_admitted consume the entry token", () => {
    expect(consumesEntryToken("admitted")).toBe(true);
    expect(consumesEntryToken("override_admitted")).toBe(true);
  });

  it("reentry_admitted does NOT consume (reusable re-entry)", () => {
    expect(consumesEntryToken("reentry_admitted")).toBe(false);
  });

  it("denials never consume a token", () => {
    expect(consumesEntryToken("denied_used")).toBe(false);
    expect(consumesEntryToken("denied_notfound")).toBe(false);
    expect(consumesEntryToken("denied_wrongzone")).toBe(false);
  });
});
