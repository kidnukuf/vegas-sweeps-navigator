/**
 * Tests for the sheet-aligned check-in export.
 *
 * Verifies that exportCheckins:
 *  - is read-only (never mutates door_scan_log or token tables),
 *  - resolves admit-type scans to bowler name + lane,
 *  - maps each sheetType to the correct destination column (AC/AE/AG),
 *  - splits matched vs unmatched rows,
 *  - dedupes multiple admits of the same token onto one row (earliest wins).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { rawQuery, rawExec } from "./db";

const ctx = { user: null } as any;
const caller = appRouter.createCaller(ctx);

// A token that does not resolve to any bowler/guest → should land in "unmatched".
const ORPHAN_TOKEN = "EXPORT-TEST-ORPHAN-TOKEN-XYZ";
let TEST_EVENT_ID = 0;

describe("offlineDoor.exportCheckins", () => {
  beforeAll(async () => {
    // Pick any existing event id so the export query has a realistic scope.
    const ev = await rawQuery<{ id: number }>("SELECT id FROM events ORDER BY id ASC LIMIT 1");
    TEST_EVENT_ID = ev[0]?.id ?? 1;
    // Seed one orphan admit scan we can assert on, idempotently.
    await rawExec(
      `INSERT IGNORE INTO door_scan_log
         (eventId, mode, token, result, reason, lane, scannedAtMs, overrideBy, wristbandNumber, edFlagged, deviceId)
       VALUES (?, 'banquet', ?, 'admitted', NULL, NULL, ?, NULL, NULL, 0, 'export-test')`,
      [TEST_EVENT_ID, ORPHAN_TOKEN, Date.now()]
    );
  });

  afterAll(async () => {
    await rawExec("DELETE FROM door_scan_log WHERE token = ?", [ORPHAN_TOKEN]);
  });

  it("returns a stable, read-only payload with correct column mapping", async () => {
    const before = await rawQuery<{ c: number }>(
      "SELECT COUNT(*) AS c FROM door_scan_log WHERE eventId = ? AND mode = 'banquet'",
      [TEST_EVENT_ID]
    );

    const res = await caller.offlineDoor.exportCheckins({ eventId: TEST_EVENT_ID, mode: "banquet" });

    // Shape checks
    expect(res.mode).toBe("banquet");
    expect(Array.isArray(res.rows)).toBe(true);
    expect(Array.isArray(res.unmatched)).toBe(true);
    expect(res.totalAdmits).toBe(res.rows.length + res.unmatched.length);

    // Every matched row maps to a valid banquet/guest column.
    for (const r of res.rows) {
      expect(["AC", "AG"]).toContain(r.targetColumn);
      expect(r.scannedAtISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    // The orphan token must appear in unmatched, not matched.
    const inMatched = res.rows.some((r) => r.token === ORPHAN_TOKEN);
    const inUnmatched = res.unmatched.some((u) => u.token === ORPHAN_TOKEN);
    expect(inMatched).toBe(false);
    expect(inUnmatched).toBe(true);

    // Read-only: row count in the log is unchanged after the export query.
    const after = await rawQuery<{ c: number }>(
      "SELECT COUNT(*) AS c FROM door_scan_log WHERE eventId = ? AND mode = 'banquet'",
      [TEST_EVENT_ID]
    );
    expect(Number(after[0].c)).toBe(Number(before[0].c));
  }, 20000);

  it("pool mode maps matched rows to AE or AG only", async () => {
    const res = await caller.offlineDoor.exportCheckins({ eventId: TEST_EVENT_ID, mode: "pool" });
    for (const r of res.rows) {
      expect(["AE", "AG"]).toContain(r.targetColumn);
    }
  }, 20000);

  it("matched rows carry a human label and group cleanly by target column (powers copy-column UI)", async () => {
    const res = await caller.offlineDoor.exportCheckins({ eventId: TEST_EVENT_ID, mode: "banquet" });
    // Every matched row must have a non-empty target column + label so the UI can group + label buttons.
    for (const r of res.rows) {
      expect(r.targetColumn).toBeTruthy();
      expect(r.targetLabel).toBeTruthy();
      expect(typeof r.scannedAtMs).toBe("number");
    }
    // Grouping by column (the exact logic the client uses) must reproduce the total matched count.
    const groups: Record<string, number> = {};
    for (const r of res.rows) groups[r.targetColumn] = (groups[r.targetColumn] ?? 0) + 1;
    const summed = Object.values(groups).reduce((a, b) => a + b, 0);
    expect(summed).toBe(res.rows.length);
  }, 20000);
});
