import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { rawQuery, rawExec } from "../db";
import {
  UpsertPrizePoolSchema,
  SetPaytableSchema,
} from "../../shared/prizePool";

// ─── Prize Pool Router ────────────────────────────────────────────────────────
// Manages prize pool configuration, paytable entries, and team payouts for an
// event. All procedures require ED authentication (protectedProcedure).

export const prizePoolRouter = router({
  // ─── Get prize pool + paytable entries for an event ────────────────────────
  getEventPrizePool: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input }) => {
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
  upsertPrizePool: protectedProcedure
    .input(UpsertPrizePoolSchema)
    .mutation(async ({ input }) => {
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
  setPaytable: protectedProcedure
    .input(SetPaytableSchema)
    .mutation(async ({ input }) => {
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

  // ─── Get team payouts for an event ─────────────────────────────────────────
  getTeamPayouts: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { eventId } = input;

      const payouts = await rawQuery<{
        id: number;
        eventId: number;
        teamId: number;
        teamName: string | null;
        finishingPlace: number | null;
        score: string | null;
        payoutAmount: string;
        denominationBreakdown: unknown;
        paid: boolean;
        paidAt: number | null;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT tp.id, tp.eventId, tp.teamId, t.teamName, tp.finishingPlace,
                tp.score, tp.payoutAmount, tp.denominationBreakdown,
                tp.paid, tp.paidAt, tp.notes, tp.createdAt, tp.updatedAt
         FROM team_payouts tp
         LEFT JOIN teams t ON t.id = tp.teamId
         WHERE tp.eventId = ?
         ORDER BY tp.finishingPlace ASC`,
        [eventId]
      );

      return payouts;
    }),
});
