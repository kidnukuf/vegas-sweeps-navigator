import { router, publicProcedure } from "../_core/trpc";
import { requireEdSession } from "../_core/edAuth";
import { z } from "zod";
import { rawQuery, rawExec } from "../db";
import { getEventSheetTarget } from "../db";
import { writePayoutsToSheet } from "../googleSheets";
import {
  UpsertPrizePoolSchema,
  SetPaytableSchema,
} from "../../shared/prizePool";

// ─── Prize Pool Router ────────────────────────────────────────────────────────
// Manages prize pool configuration, paytable entries, and team payouts for an
// event. All procedures require ED authentication (protectedProcedure).

export const prizePoolRouter = router({
  // ─── Get prize pool + paytable entries for an event ────────────────────────
  getEventPrizePool: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId } = input;

      // Fetch prize pool record
      const pools = await rawQuery<{
        id: number;
        eventId: number;
        totalAmount: string;
        paytableMode: "percentage" | "rank";
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT id, eventId, totalAmount, paytableMode, notes, createdAt, updatedAt
         FROM prize_pool
         WHERE eventId = ?
         LIMIT 1`,
        [eventId]
      );

      const pool = pools[0] ?? null;

      if (!pool) {
        return { pool: null, entries: [] };
      }

      // Fetch paytable entries ordered by place
      const entries = await rawQuery<{
        id: number;
        prizePoolId: number;
        eventId: number;
        place: number;
        amount: string | null;
        percentage: string | null;
        label: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT id, prizePoolId, eventId, place, amount, percentage, label, createdAt, updatedAt
         FROM paytable_entries
         WHERE prizePoolId = ?
         ORDER BY place ASC`,
        [pool.id]
      );

      return { pool, entries };
    }),

  // ─── Create or update the prize pool for an event ──────────────────────────
  upsertPrizePool: publicProcedure
    .input(UpsertPrizePoolSchema)
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId, totalAmount, paytableMode, notes } = input;

      // Check if a prize pool already exists for this event
      const existing = await rawQuery<{ id: number }>(
        `SELECT id FROM prize_pool WHERE eventId = ? LIMIT 1`,
        [eventId]
      );

      if (existing.length > 0) {
        // Update existing record
        await rawQuery(
          `UPDATE prize_pool
           SET totalAmount = ?, paytableMode = ?, notes = ?, updatedAt = NOW()
           WHERE eventId = ?`,
          [totalAmount.toString(), paytableMode, notes ?? null, eventId]
        );
        return { id: existing[0].id, created: false };
      } else {
        // Insert new record
        const result = await rawExec(
          `INSERT INTO prize_pool (eventId, totalAmount, paytableMode, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [eventId, totalAmount.toString(), paytableMode, notes ?? null]
        );
        return { id: result.insertId, created: true };
      }
    }),

  // ─── Replace all paytable entries for a prize pool ─────────────────────────
  setPaytable: publicProcedure
    .input(SetPaytableSchema)
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId, prizePoolId, entries } = input;

      // Delete all existing entries for this prize pool
      await rawQuery(
        `DELETE FROM paytable_entries WHERE prizePoolId = ?`,
        [prizePoolId]
      );

      if (entries.length === 0) {
        return { inserted: 0 };
      }

      // Bulk insert new entries
      const placeholders = entries.map(() => "(?, ?, ?, ?, ?, ?, NOW(), NOW())").join(", ");
      const values: (number | string | null)[] = [];
      for (const entry of entries) {
        values.push(
          prizePoolId,
          eventId,
          entry.place,
          entry.amount != null ? entry.amount.toString() : null,
          entry.percentage != null ? entry.percentage.toString() : null,
          entry.label ?? null
        );
      }

      await rawQuery(
        `INSERT INTO paytable_entries (prizePoolId, eventId, place, amount, percentage, label, createdAt, updatedAt)
         VALUES ${placeholders}`,
        values
      );

      return { inserted: entries.length };
    }),

  // ─── Get team payouts for an event (joined with team + center info) ──────────────────
  getTeamPayouts: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId } = input;

      const payouts = await rawQuery<{
        id: number;
        eventId: number;
        teamId: number;
        teamName: string | null;
        teamCode: string | null;
        centerName: string | null;
        finishingPlace: number | null;
        score: string | null;
        payoutAmount: string;
        paid: boolean;
        notes: string | null;
        updatedAt: Date;
      }>(
        `SELECT tp.id, tp.eventId, tp.teamId, t.teamName, t.teamCode,
                bc.centerName, tp.finishingPlace,
                tp.score, tp.payoutAmount, tp.paid, tp.notes, tp.updatedAt
         FROM team_payouts tp
         LEFT JOIN teams t ON t.id = tp.teamId
         LEFT JOIN bowling_centers bc ON bc.id = t.centerId
         WHERE tp.eventId = ?
         ORDER BY tp.finishingPlace ASC, bc.centerName ASC, t.teamCode ASC`,
        [eventId]
      );

      return payouts;
    }),

  // ─── Get bowler counts per team for an event ──────────────────────────────────────────
  getTeamBowlerCounts: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const rows = await rawQuery<{ teamId: number; bowlerCount: number }>(
        `SELECT teamId, COUNT(*) AS bowlerCount
         FROM bowlers
         WHERE eventId = ? AND teamId IS NOT NULL
         GROUP BY teamId`,
        [input.eventId]
      );
      // Return as a map: teamId → bowlerCount
      const map: Record<number, number> = {};
      for (const row of rows) {
        map[row.teamId] = Number(row.bowlerCount);
      }
      return map;
    }),

  // ─── Upsert a single team result (place, score, payout, denomination breakdown) ────
  upsertTeamResult: publicProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        teamId: z.number().int().positive(),
        prizePoolId: z.number().int().positive().nullable().optional(),
        finishingPlace: z.number().int().min(1).nullable().optional(),
        score: z.string().nullable().optional(),
        payoutAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).or(z.literal("0")),
        denominationBreakdown: z.record(z.string(), z.number()).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId, teamId, prizePoolId, finishingPlace, score, payoutAmount, denominationBreakdown, notes } = input;
      const denomJson = denominationBreakdown ? JSON.stringify(denominationBreakdown) : null;

      const existing = await rawQuery<{ id: number }>(
        `SELECT id FROM team_payouts WHERE eventId = ? AND teamId = ? LIMIT 1`,
        [eventId, teamId]
      );

      if (existing.length > 0) {
        await rawQuery(
          `UPDATE team_payouts
           SET prizePoolId = ?, finishingPlace = ?, score = ?, payoutAmount = ?,
               denominationBreakdown = ?, notes = ?, updatedAt = NOW()
           WHERE id = ?`,
          [prizePoolId ?? null, finishingPlace ?? null, score ?? null, payoutAmount,
           denomJson, notes ?? null, existing[0].id]
        );
        return { id: existing[0].id, created: false };
      } else {
        const result = await rawExec(
          `INSERT INTO team_payouts (eventId, teamId, prizePoolId, finishingPlace, score, payoutAmount, denominationBreakdown, notes, paid, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, false, NOW(), NOW())`,
          [eventId, teamId, prizePoolId ?? null, finishingPlace ?? null, score ?? null,
           payoutAmount, denomJson, notes ?? null]
        );
        return { id: result.insertId, created: true };
      }
    }),

  // ─── Clear a team result row ──────────────────────────────────────────────────────────────────
  clearTeamResult: publicProcedure
    .input(z.object({ eventId: z.number().int().positive(), teamId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      await rawQuery(
        `DELETE FROM team_payouts WHERE eventId = ? AND teamId = ?`,
        [input.eventId, input.teamId]
      );
      return { ok: true };
    }),

  // ─── Write payout results to Google Sheet (BJ=Place, BK=Amount, BL=Bills) ──────────────────
  writePayoutsToSheet: publicProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        payouts: z.array(
          z.object({
            teamCode: z.string(),
            finishingPlace: z.number().int().min(1).nullable(),
            payoutAmount: z.number().min(0),
            billBreakdown: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId, payouts } = input;
      // Resolve the sheet target for this event
      const sheetTarget = await getEventSheetTarget(eventId);
      const result = await writePayoutsToSheet({
        payouts,
        target: { spreadsheetId: sheetTarget.spreadsheetId, sheetName: sheetTarget.sheetName },
      });
      return result;
    }),
});
