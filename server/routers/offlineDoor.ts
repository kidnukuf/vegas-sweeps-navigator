/**
 * offlineDoor router
 *
 * Server side of the single-laptop, offline-first door scanner (banquet + pool party).
 * The device pre-loads everything via `loadData` while online, then validates entirely
 * on-device with zero internet. When connectivity returns, `sync` idempotently uploads
 * all offline scans (admits, denials, overrides, ED flags) and reentry issue/release
 * events, marking the canonical tables used + writing timestamps back to the Google Sheet.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  loadDoorGuests,
  ensureReentryPool,
  getReentryPool,
  issueReentryCode,
  releaseReentryCode,
  recordSyncedScan,
  markTokenUsedForSync,
  getEdFlagQueue,
  markEdFlagReviewed,
  getDoorScanStats,
  getEventById,
  getEventSheetTarget,
  getCheckinExportRows,
  type DoorMode,
} from "../db";
import { writeScanUsedToSheet } from "../googleSheets";

const modeSchema = z.enum(["banquet", "pool"]);
const zoneSchema = z.enum(["N", "E", "S", "W"]);

/** Deterministic, collision-resistant reentry token: RE-<mode>-<zone>-<eventId>-<index> */
function makeReentryToken(eventId: number, mode: DoorMode, zone: string, index: number): string {
  const m = mode === "banquet" ? "BQ" : "PP";
  return `RE-${m}-${zone}-${eventId}-${String(index).padStart(3, "0")}`;
}

export const offlineDoorRouter = router({
  /**
   * Pre-load the full offline dataset for an event + mode in a single call:
   * all valid tokens (bowler + guest) with current used status, the 200-code
   * reentry pool (generated on first call), and event metadata.
   */
  loadData: publicProcedure
    .input(z.object({ eventId: z.number(), mode: modeSchema }))
    .query(async ({ input }) => {
      const guests = await loadDoorGuests(input.eventId, input.mode);
      const reentry = await ensureReentryPool(input.eventId, input.mode, makeReentryToken);
      const event = (await getEventById(input.eventId)) as Record<string, unknown> | null;
      return {
        loadedAtMs: Date.now(),
        eventId: input.eventId,
        mode: input.mode,
        eventName: (event?.eventName as string) ?? "Event",
        guests,
        reentry: reentry.map((r) => ({
          token: r.token,
          zone: r.zone,
          inUse: Boolean(r.inUse),
          linkedWristband: r.linkedWristband,
        })),
        guestCount: guests.length,
        reentryCount: reentry.length,
      };
    }),

  /** Lightweight connectivity probe used by the device's auto-sync loop. */
  ping: publicProcedure.query(() => ({ ok: true, serverTimeMs: Date.now() })),

  /**
   * Idempotently upload a batch of offline scans + reentry events.
   * - Each scan is recorded in door_scan_log (unique on token+scannedAtMs → no dupes).
   * - admitted / override_admitted / reentry_admitted scans mark the canonical token
   *   used and write the timestamp to the Google Sheet (fire-and-forget per row).
   * - Reentry issue/release events update reentry_codes.
   */
  sync: publicProcedure
    .input(
      z.object({
        eventId: z.number(),
        mode: modeSchema,
        deviceId: z.string().optional(),
        scans: z
          .array(
            z.object({
              token: z.string(),
              result: z.enum([
                "admitted",
                "denied_used",
                "denied_notfound",
                "override_admitted",
                "reentry_admitted",
                "denied_wrongzone",
              ]),
              reason: z.string().nullable().optional(),
              lane: z.number().nullable().optional(),
              scannedAtMs: z.number(),
              overrideBy: z.string().nullable().optional(),
              wristbandNumber: z.string().nullable().optional(),
              edFlagged: z.boolean().optional(),
            })
          )
          .default([]),
        reentryEvents: z
          .array(
            z.object({
              token: z.string(),
              action: z.enum(["issue", "release"]),
              wristbandNumber: z.string().nullable().optional(),
              atMs: z.number(),
            })
          )
          .default([]),
      })
    )
    .mutation(async ({ input }) => {
      let inserted = 0;
      let duplicates = 0;
      let marked = 0;
      let flagged = 0;
      const errors: string[] = [];

      const target = input.eventId ? await getEventSheetTarget(input.eventId) : undefined;

      for (const s of input.scans) {
        try {
          const isNew = await recordSyncedScan({
            eventId: input.eventId,
            mode: input.mode,
            token: s.token,
            result: s.result,
            reason: s.reason ?? null,
            lane: s.lane ?? null,
            scannedAtMs: s.scannedAtMs,
            overrideBy: s.overrideBy ?? null,
            wristbandNumber: s.wristbandNumber ?? null,
            edFlagged: Boolean(s.edFlagged),
            deviceId: input.deviceId ?? null,
          });
          if (!isNew) {
            duplicates++;
            continue;
          }
          inserted++;
          if (s.edFlagged) flagged++;

          // Only ADMIT-type results consume the token.
          const admits = ["admitted", "override_admitted", "reentry_admitted"];
          if (admits.includes(s.result) && s.result !== "reentry_admitted") {
            const info = await markTokenUsedForSync(s.token, input.mode);
            if (info) {
              marked++;
              // Fire-and-forget sheet write-back (never blocks sync).
              writeScanUsedToSheet({
                firstName: info.firstName,
                lastName: info.lastName,
                laneNumber: null,
                type: info.sheetType,
                timestamp: new Date(s.scannedAtMs).toISOString(),
                target,
              }).catch((err) =>
                console.error("[offlineDoor] sheet write-back failed (non-fatal):", err)
              );
            }
          }
        } catch (err) {
          errors.push(`scan ${s.token}: ${(err as Error).message}`);
        }
      }

      for (const e of input.reentryEvents) {
        try {
          if (e.action === "issue") {
            await issueReentryCode(e.token, e.wristbandNumber ?? "", e.atMs);
          } else {
            await releaseReentryCode(e.token, e.atMs);
          }
        } catch (err) {
          errors.push(`reentry ${e.token}: ${(err as Error).message}`);
        }
      }

      return {
        success: errors.length === 0,
        inserted,
        duplicates,
        marked,
        flagged,
        reentryProcessed: input.reentryEvents.length,
        errors,
      };
    }),

  /** Current reentry pool state (for the Console reentry manager). */
  reentryPool: publicProcedure
    .input(z.object({ eventId: z.number(), mode: modeSchema }))
    .query(async ({ input }) => {
      const pool = await getReentryPool(input.eventId, input.mode);
      return pool.map((r) => ({
        token: r.token,
        zone: r.zone as string,
        inUse: Boolean(r.inUse),
        linkedWristband: r.linkedWristband,
        issuedAtMs: r.issuedAtMs,
      }));
    }),

  /** ED review queue: flagged scans for an event (synced from devices). */
  edQueue: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      return getEdFlagQueue(input.eventId);
    }),

  markEdReviewed: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await markEdFlagReviewed(input.id, Date.now());
      return { success: true };
    }),

  /**
   * Sheet-aligned check-in export. Returns every admit (resolved to bowler name +
   * lane + team) for the event/mode, grouped by the Google Sheet target column
   * (banquet -> AC, pool -> AE, guest_pool -> AG). Read-only: does NOT touch the DB.
   * The client builds the downloadable CSV/Excel from this so it works fully offline.
   */
  exportCheckins: publicProcedure
    .input(z.object({ eventId: z.number(), mode: modeSchema }))
    .query(async ({ input }) => {
      const rows = await getCheckinExportRows(input.eventId, input.mode);
      // Map each sheetType to its destination column letter in the master sheet layout.
      const COLUMN_BY_TYPE: Record<string, string> = {
        banquet: "AC",
        pool: "AE",
        guest_pool: "AG",
      };
      const COLUMN_LABEL: Record<string, string> = {
        banquet: "Banquet Used",
        pool: "Pool Party Confirmed",
        guest_pool: "Guest Pool Confirmed",
      };
      const matched = rows.filter((r) => r.firstName || r.lastName);
      const unmatched = rows.filter((r) => !r.firstName && !r.lastName);
      return {
        eventId: input.eventId,
        mode: input.mode,
        generatedAtMs: Date.now(),
        totalAdmits: rows.length,
        rows: matched.map((r) => ({
          token: r.token,
          firstName: r.firstName,
          lastName: r.lastName,
          laneNumber: r.laneNumber,
          teamNumber: r.teamNumber,
          sheetType: r.sheetType,
          targetColumn: COLUMN_BY_TYPE[r.sheetType] ?? "",
          targetLabel: COLUMN_LABEL[r.sheetType] ?? r.sheetType,
          scannedAtMs: r.scannedAtMs,
          scannedAtISO: new Date(r.scannedAtMs).toISOString(),
          isReentry: r.isReentry,
        })),
        unmatched: unmatched.map((r) => ({
          token: r.token,
          scannedAtMs: r.scannedAtMs,
          scannedAtISO: new Date(r.scannedAtMs).toISOString(),
          result: r.result,
        })),
      };
    }),

  /** Door scan counts for the Console dashboard. */
  stats: publicProcedure
    .input(z.object({ eventId: z.number(), mode: modeSchema }))
    .query(async ({ input }) => {
      const rows = await getDoorScanStats(input.eventId, input.mode);
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.result] = Number(r.c);
      return counts;
    }),

  // Expose zone schema for client typing convenience (no-op runtime).
  _zones: publicProcedure.query(() => ["N", "E", "S", "W"] as const),
});

export type ReentryZoneT = z.infer<typeof zoneSchema>;
