/**
 * Tests for the offline-first door scanner backend.
 *
 * These exercise the real tRPC caller against the live dev database. They are
 * written to be self-cleaning and idempotent so they can run repeatedly:
 *   - They use a synthetic, namespaced token + far-future timestamps so they
 *     never collide with real event data.
 *   - The key guarantee under test is sync idempotency: re-sending the same
 *     scan batch must insert 0 new rows the second time.
 */
import { afterAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

const EVENT_ID = 1;
const MODE = "banquet" as const;

// Unique, namespaced markers so we never touch real rows and can clean up.
const RUN = `TESTDOOR-${Date.now()}`;
const TOKEN_A = `${RUN}-A`;
const TS = 4102444800000; // year 2100 — far outside any real scan window.

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller(publicCtx());

afterAll(async () => {
  // Clean up any synthetic scans this run created.
  const db = await getDb();
  if (db) {
    // @ts-expect-error drizzle execute on raw sql
    await db.execute?.(`DELETE FROM door_scan_log WHERE token LIKE '${RUN}%'`);
  }
});

describe("offlineDoor.ping", () => {
  it("responds ok for the connectivity probe", async () => {
    const res = await caller.offlineDoor.ping();
    expect(res.ok).toBe(true);
    expect(typeof res.serverTimeMs).toBe("number");
  });
});

describe("offlineDoor.loadData", () => {
  it("returns guests + a 200-code reentry pool (50 per zone)", { timeout: 30000 }, async () => {
    const data = await caller.offlineDoor.loadData({ eventId: EVENT_ID, mode: MODE });
    expect(data.eventId).toBe(EVENT_ID);
    expect(data.mode).toBe(MODE);
    expect(Array.isArray(data.guests)).toBe(true);

    // Reentry pool: 4 zones × 50 = 200, all tokens unique, each zone-locked.
    expect(data.reentry.length).toBe(200);
    const byZone: Record<string, number> = {};
    for (const r of data.reentry) byZone[r.zone] = (byZone[r.zone] ?? 0) + 1;
    expect(byZone.N).toBe(50);
    expect(byZone.E).toBe(50);
    expect(byZone.S).toBe(50);
    expect(byZone.W).toBe(50);
    const uniqueTokens = new Set(data.reentry.map((r) => r.token));
    expect(uniqueTokens.size).toBe(200);
  });

  it("is stable across calls (reentry pool generated once, not duplicated)", { timeout: 30000 }, async () => {
    const first = await caller.offlineDoor.loadData({ eventId: EVENT_ID, mode: MODE });
    const second = await caller.offlineDoor.loadData({ eventId: EVENT_ID, mode: MODE });
    expect(second.reentry.length).toBe(first.reentry.length);
    expect(second.reentry.length).toBe(200);
  });
});

describe("offlineDoor.sync idempotency", () => {
  it("inserts new scans once and treats re-sends as duplicates", async () => {
    const batch = {
      eventId: EVENT_ID,
      mode: MODE,
      deviceId: RUN,
      scans: [
        {
          token: TOKEN_A,
          result: "denied_notfound" as const, // non-admit → no token consumption / sheet write
          reason: "synthetic test scan",
          lane: 1,
          scannedAtMs: TS,
          overrideBy: null,
          wristbandNumber: null,
          edFlagged: false,
        },
      ],
      reentryEvents: [],
    };

    const first = await caller.offlineDoor.sync(batch);
    expect(first.inserted).toBe(1);
    expect(first.duplicates).toBe(0);

    // Re-send the exact same batch — must dedupe on (token, scannedAtMs).
    const second = await caller.offlineDoor.sync(batch);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it("records ED-flagged scans so they appear in the ED queue", async () => {
    const flaggedToken = `${RUN}-FLAG`;
    await caller.offlineDoor.sync({
      eventId: EVENT_ID,
      mode: MODE,
      deviceId: RUN,
      scans: [
        {
          token: flaggedToken,
          result: "denied_used" as const,
          reason: "suspicious — test",
          lane: 2,
          scannedAtMs: TS + 1000,
          overrideBy: null,
          wristbandNumber: null,
          edFlagged: true,
        },
      ],
      reentryEvents: [],
    });

    const queue = await caller.offlineDoor.edQueue({ eventId: EVENT_ID });
    const found = (queue as Array<{ token: string }>).find((q) => q.token === flaggedToken);
    expect(found).toBeTruthy();
  });
});

describe("offlineDoor.reentryPool", () => {
  it("exposes the pool with zone + inUse fields", async () => {
    // Ensure the pool exists.
    await caller.offlineDoor.loadData({ eventId: EVENT_ID, mode: MODE });
    const pool = await caller.offlineDoor.reentryPool({ eventId: EVENT_ID, mode: MODE });
    expect(pool.length).toBe(200);
    for (const r of pool.slice(0, 5)) {
      expect(["N", "E", "S", "W"]).toContain(r.zone);
      expect(typeof r.inUse).toBe("boolean");
    }
  });
});
