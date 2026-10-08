import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { assertEventAccess } from "../_core/edAuth";
import { rawExec, rawQuery, writeAuditLog } from "../db";

function createPaperReference(): string {
  return `PT-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export const claimAccessRouter = router({
  policy: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await rawQuery<{ count: number }>("SELECT COUNT(*) AS count FROM bowler_claim_codes WHERE eventId = ?", [input.eventId]);
      return { claimCodeRequired: Number(rows[0]?.count ?? 0) > 0 };
    }),

  admissionPasses: router({
    listForEvent: publicProcedure
      .input(z.object({ eventId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        await assertEventAccess(ctx, input.eventId);
        const rows = await rawQuery<{
          eventId: number; eventName: string; eventYear: number | null; startDate: string | null; endDate: string | null;
          poolPartyEnabled: number | null; banquetLocation: string | null; banquetTime: string | null; poolPartyTime: string | null;
          bowlerId: number; firstName: string; lastName: string; bowlerIdLabel: string | null; centerName: string | null; teamName: string | null;
          under21: number | null; guestNames: string | null; guestCount: number;
          hasPoolPass: number; hasBanquetPass: number;
        }>(
          `SELECT e.id AS eventId, e.eventName, e.eventYear, e.startDate, e.endDate,
                  e.poolPartyEnabled, e.banquetLocation, e.banquetTime, e.poolPartyTime,
                  b.id AS bowlerId, b.legalFirstName AS firstName, b.legalLastName AS lastName,
                  b.scantronId AS bowlerIdLabel, b.under21,
                  bc.centerName, t.teamName,
                  CASE WHEN b.poolPartyToken IS NOT NULL AND b.poolPartyToken <> '' THEN 1 ELSE 0 END AS hasPoolPass,
                  CASE WHEN b.banquetToken IS NOT NULL AND b.banquetToken <> '' THEN 1 ELSE 0 END AS hasBanquetPass,
                  COALESCE(g.guestCount, 0) AS guestCount, g.guestNames
           FROM bowlers b
           INNER JOIN events e ON e.id = b.eventId
           LEFT JOIN bowling_centers bc ON bc.id = b.centerId
           LEFT JOIN teams t ON t.id = b.teamId
           LEFT JOIN (
             SELECT bowlerId, COUNT(*) AS guestCount,
                    GROUP_CONCAT(NULLIF(TRIM(guestName), '') ORDER BY suffix SEPARATOR ', ') AS guestNames
             FROM guest_pool_party_tokens
             WHERE disabled = 0
             GROUP BY bowlerId
           ) g ON g.bowlerId = b.id
           WHERE b.eventId = ?
           ORDER BY bc.centerName, t.teamName, b.legalLastName, b.legalFirstName`,
          [input.eventId],
        );
        return rows.map((row) => ({
          ...row,
          poolPartyEnabled: Boolean(row.poolPartyEnabled),
          under21: Boolean(row.under21),
          hasPoolPass: Boolean(row.hasPoolPass),
          hasBanquetPass: Boolean(row.hasBanquetPass),
        }));
      }),
  }),

  paperTickets: router({
    listForEvent: publicProcedure
      .input(z.object({ eventId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        await assertEventAccess(ctx, input.eventId);
        const rows = await rawQuery<{
          id: string; bowlerId: number; status: "requested" | "ready" | "delivered" | "restored";
          requestedBy: "bowler" | "event_director" | "owner"; note: string | null; referenceCode: string;
          requestedAt: number; handledAt: number | null; legalFirstName: string; legalLastName: string;
          centerName: string | null; teamName: string | null; scantronId: string | null;
          poolPartyToken: string | null; banquetToken: string | null;
        }>(
          `SELECT p.id, p.bowlerId, p.status, p.requestedBy, p.note, p.referenceCode, p.requestedAt, p.handledAt,
                  b.legalFirstName, b.legalLastName, b.scantronId, b.poolPartyToken, b.banquetToken,
                  bc.centerName, t.teamName
           FROM bowler_paper_ticket_requests p
           INNER JOIN bowlers b ON b.id = p.bowlerId AND b.eventId = p.eventId
           LEFT JOIN bowling_centers bc ON bc.id = b.centerId
           LEFT JOIN teams t ON t.id = b.teamId
           WHERE p.eventId = ?
           ORDER BY FIELD(p.status, 'requested', 'ready', 'delivered', 'restored'), bc.centerName, b.legalLastName, b.legalFirstName`,
          [input.eventId],
        );
        return rows.map((row) => ({ ...row, hasDigitalPoolPass: Boolean(row.poolPartyToken), hasDigitalBanquetPass: Boolean(row.banquetToken) }));
      }),

    createForBowler: publicProcedure
      .input(z.object({
        eventId: z.number().int().positive(),
        bowlerId: z.number().int().positive(),
        note: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const session = await assertEventAccess(ctx, input.eventId);
        const bowlerRows = await rawQuery<{ id: number }>("SELECT id FROM bowlers WHERE id = ? AND eventId = ? LIMIT 1", [input.bowlerId, input.eventId]);
        if (!bowlerRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found in this event." });
        const existing = await rawQuery<{ id: string }>("SELECT id FROM bowler_paper_ticket_requests WHERE bowlerId = ? AND eventId = ? LIMIT 1", [input.bowlerId, input.eventId]);
        if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "This bowler already has a paper-ticket record. Update the existing record instead." });

        const id = crypto.randomUUID();
        const requestedBy = session.type === "owner" ? "owner" : "event_director";
        const now = Date.now();
        await rawExec(
          `INSERT INTO bowler_paper_ticket_requests
            (id, eventId, bowlerId, status, requestedBy, note, referenceCode, requestedAt)
           VALUES (?, ?, ?, 'requested', ?, ?, ?, ?)`,
          [id, input.eventId, input.bowlerId, requestedBy, input.note?.trim() || null, createPaperReference(), now],
        );
        await writeAuditLog({
          eventId: input.eventId,
          actorRole: session.type === "owner" ? "Owner" : "EventDirector",
          actorId: session.userId ?? session.staffId,
          action: "paper_ticket_requested",
          targetId: input.bowlerId,
          targetType: "bowler",
          details: JSON.stringify({ requestedBy }),
        });
        return { success: true, id };
      }),

    updateStatus: publicProcedure
      .input(z.object({
        eventId: z.number().int().positive(),
        requestId: z.string().uuid(),
        status: z.enum(["requested", "ready", "delivered", "restored"]),
        note: z.string().trim().max(500).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const session = await assertEventAccess(ctx, input.eventId);
        const currentRows = await rawQuery<{ bowlerId: number; status: "requested" | "ready" | "delivered" | "restored" }>(
          "SELECT bowlerId, status FROM bowler_paper_ticket_requests WHERE id = ? AND eventId = ? LIMIT 1",
          [input.requestId, input.eventId],
        );
        const current = currentRows[0];
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Paper-ticket record not found for this event." });
        const allowedTransitions: Record<string, string[]> = {
          requested: ["ready", "restored"],
          ready: ["delivered", "restored"],
          delivered: ["restored"],
          restored: ["requested"],
        };
        if (input.status !== current.status && !allowedTransitions[current.status].includes(input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That paper-ticket status change is not allowed." });
        }
        const now = Date.now();
        const note = input.note === undefined ? undefined : (input.note?.trim() || null);
        if (note === undefined) {
          await rawExec("UPDATE bowler_paper_ticket_requests SET status = ?, handledAt = ?, handledByStaffId = ? WHERE id = ? AND eventId = ?", [input.status, now, session.staffId ?? null, input.requestId, input.eventId]);
        } else {
          await rawExec("UPDATE bowler_paper_ticket_requests SET status = ?, note = ?, handledAt = ?, handledByStaffId = ? WHERE id = ? AND eventId = ?", [input.status, note, now, session.staffId ?? null, input.requestId, input.eventId]);
        }
        await writeAuditLog({
          eventId: input.eventId,
          actorRole: session.type === "owner" ? "Owner" : "EventDirector",
          actorId: session.userId ?? session.staffId,
          action: "paper_ticket_status_updated",
          targetId: current.bowlerId,
          targetType: "paper_ticket",
          details: JSON.stringify({ from: current.status, to: input.status }),
        });
        return { success: true };
      }),
  }),
});
