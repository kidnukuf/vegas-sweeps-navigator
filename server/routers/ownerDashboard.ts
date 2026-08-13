import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deleteBowler, rawExec, rawQuery, writeAuditLog } from "../db";
import { requireOwner } from "../_core/edAuth";
import { publicProcedure, router } from "../_core/trpc";
import { assessOwnerReadiness } from "../ownerDashboardLogic";

const optionalText = z.string().max(2_000).optional().nullable();

const eventEditorInput = z.object({
  id: z.number().int().positive(),
  eventName: z.string().min(1).max(255),
  eventYear: z.number().int().min(2020).max(2100),
  status: z.enum(["planning", "active", "completed"]),
  startDate: optionalText,
  endDate: optionalText,
  bowlingDate: optionalText,
  squadTime: optionalText,
  banquetDay: optionalText,
  banquetTime: optionalText,
  banquetLocation: optionalText,
  poolPartyEnabled: z.boolean(),
  poolPartyTime: optionalText,
  tshirtsProvided: z.boolean(),
  tshirtPickupLocation: optionalText,
  tshirtPickupTime: optionalText,
  sheetSpreadsheetId: optionalText,
  sheetTabName: optionalText,
  sheetTabNickname: optionalText,
});

const bowlerEditorInput = z.object({
  id: z.number().int().positive(),
  legalFirstName: z.string().min(1).max(100),
  legalLastName: z.string().min(1).max(100),
  preferredName: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().max(20).optional().nullable(),
  scantronId: z.string().max(10).optional().nullable(),
  registrationStatus: z.enum(["pre_registered", "signed_up", "verified", "checked_in", "unmatched"]),
  under21: z.boolean(),
  isCapitain: z.boolean(),
  tshirtSize: z.string().max(10).optional().nullable(),
  squadTime: z.string().max(50).optional().nullable(),
  laneNumber: z.number().int().min(1).max(999).optional().nullable(),
  squadTime2: z.string().max(50).optional().nullable(),
  laneNumber2: z.number().int().min(1).max(999).optional().nullable(),
  banquetTable: optionalText,
  notes: optionalText,
});

type OverviewRow = {
  id: number;
  companyName: string | null;
  groupSlug: string | null;
  eventName: string;
  eventYear: number;
  status: "planning" | "active" | "completed";
  startDate: string | null;
  endDate: string | null;
  poolPartyEnabled: number;
  sheetSpreadsheetId: string | null;
  sheetTabName: string | null;
  sheetLastSyncedAt: number | null;
  banquetLocation: string | null;
  banquetTime: string | null;
  bowlers: number | string;
  missingCenters: number | string;
  missingIds: number | string;
  missingBanquetPasses: number | string;
  missingPoolPasses: number | string;
  missingClaimCodes: number | string;
  unmatchedBowlers: number | string;
  assignedDirectors: number | string;
};

const asNumber = (value: number | string | null | undefined) => Number(value ?? 0);
const cleanText = (value: string | null | undefined) => value?.trim() || null;

export const ownerDashboardRouter = router({
  overview: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    const rows = await rawQuery<OverviewRow>(
      `SELECT e.id, c.name AS companyName, e.groupSlug, e.eventName, e.eventYear, e.status,
              e.startDate, e.endDate, e.poolPartyEnabled, e.sheetSpreadsheetId, e.sheetTabName,
              e.sheetLastSyncedAt, e.banquetLocation, e.banquetTime,
              COUNT(DISTINCT b.id) AS bowlers,
              COUNT(DISTINCT CASE WHEN b.id IS NOT NULL AND b.centerId IS NULL THEN b.id END) AS missingCenters,
              COUNT(DISTINCT CASE WHEN b.id IS NOT NULL AND (b.scantronId IS NULL OR b.scantronId = '') THEN b.id END) AS missingIds,
              COUNT(DISTINCT CASE WHEN b.id IS NOT NULL AND (b.banquetToken IS NULL OR b.banquetToken = '') THEN b.id END) AS missingBanquetPasses,
              COUNT(DISTINCT CASE WHEN e.poolPartyEnabled = 1 AND b.id IS NOT NULL AND (b.poolPartyToken IS NULL OR b.poolPartyToken = '') THEN b.id END) AS missingPoolPasses,
              COUNT(DISTINCT CASE WHEN b.id IS NOT NULL AND cc.id IS NULL THEN b.id END) AS missingClaimCodes,
              COUNT(DISTINCT CASE WHEN b.registrationStatus = 'unmatched' THEN b.id END) AS unmatchedBowlers,
              COUNT(DISTINCT eda.staffId) AS assignedDirectors
       FROM events e
       LEFT JOIN companies c ON c.id = e.companyId
       LEFT JOIN bowlers b ON b.eventId = e.id
       LEFT JOIN bowler_claim_codes cc ON cc.bowlerId = b.id AND cc.eventId = e.id AND cc.status <> 'void'
       LEFT JOIN event_director_assignments eda ON eda.eventId = e.id
       GROUP BY e.id, c.name, e.groupSlug, e.eventName, e.eventYear, e.status,
                e.startDate, e.endDate, e.poolPartyEnabled, e.sheetSpreadsheetId, e.sheetTabName,
                e.sheetLastSyncedAt, e.banquetLocation, e.banquetTime
       ORDER BY FIELD(e.status, 'active', 'planning', 'completed'), e.eventYear DESC, e.id DESC`
    );
    return rows.map((row) => {
      const metrics = {
        bowlers: asNumber(row.bowlers),
        hasSheet: Boolean(row.sheetSpreadsheetId),
        hasTab: Boolean(row.sheetTabName),
        missingCenters: asNumber(row.missingCenters),
        missingIds: asNumber(row.missingIds),
        missingBanquetPasses: asNumber(row.missingBanquetPasses),
        missingPoolPasses: asNumber(row.missingPoolPasses),
        missingClaimCodes: asNumber(row.missingClaimCodes),
        unmatchedBowlers: asNumber(row.unmatchedBowlers),
        hasBanquetDetails: Boolean(row.banquetLocation?.trim() && row.banquetTime?.trim()),
        assignedDirectors: asNumber(row.assignedDirectors),
      };
      return { ...row, ...metrics, readiness: assessOwnerReadiness(metrics) };
    });
  }),

  eventDetail: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireOwner(ctx);
      const eventRows = await rawQuery<Record<string, unknown>>(
        `SELECT e.*, c.name AS companyName FROM events e LEFT JOIN companies c ON c.id = e.companyId WHERE e.id = ? LIMIT 1`,
        [input.eventId]
      );
      const event = eventRows[0];
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      const bowlers = await rawQuery<Record<string, unknown>>(
        `SELECT b.*, bc.centerName, t.teamName, t.teamCode,
                COUNT(DISTINCT g.id) AS guestCount,
                MAX(CASE WHEN c.id IS NULL THEN 0 ELSE 1 END) AS hasClaimCode
         FROM bowlers b
         LEFT JOIN bowling_centers bc ON bc.id = b.centerId
         LEFT JOIN teams t ON t.id = b.teamId
         LEFT JOIN guest_pool_party_tokens g ON g.bowlerId = b.id AND g.disabled = 0
         LEFT JOIN bowler_claim_codes c ON c.bowlerId = b.id AND c.eventId = b.eventId AND c.status <> 'void'
         WHERE b.eventId = ?
         GROUP BY b.id, bc.centerName, t.teamName, t.teamCode
         ORDER BY bc.centerName, t.teamCode, b.legalLastName, b.legalFirstName`,
        [input.eventId]
      );
      return { event, bowlers };
    }),

  updateEvent: publicProcedure.input(eventEditorInput).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    await rawExec(
      `UPDATE events SET eventName=?, eventYear=?, status=?, startDate=?, endDate=?, bowlingDate=?, squadTime=?,
          banquetDay=?, banquetTime=?, banquetLocation=?, poolPartyEnabled=?, poolPartyTime=?,
          tshirtsProvided=?, tshirtPickupLocation=?, tshirtPickupTime=?, sheetSpreadsheetId=?, sheetTabName=?, sheetTabNickname=?
       WHERE id=?`,
      [
        input.eventName.trim(), input.eventYear, input.status, cleanText(input.startDate), cleanText(input.endDate),
        cleanText(input.bowlingDate), cleanText(input.squadTime), cleanText(input.banquetDay), cleanText(input.banquetTime),
        cleanText(input.banquetLocation), input.poolPartyEnabled ? 1 : 0, cleanText(input.poolPartyTime),
        input.tshirtsProvided ? 1 : 0, cleanText(input.tshirtPickupLocation), cleanText(input.tshirtPickupTime),
        cleanText(input.sheetSpreadsheetId), cleanText(input.sheetTabName), cleanText(input.sheetTabNickname), input.id,
      ]
    );
    await writeAuditLog({ eventId: input.id, actorRole: "Owner", actorId: session.userId, action: "owner_update_event", targetId: input.id, targetType: "event", details: `Owner updated event settings for ${input.eventName.trim()}` });
    return { success: true };
  }),

  updateBowler: publicProcedure.input(bowlerEditorInput).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    const rows = await rawQuery<{ eventId: number }>(`SELECT eventId FROM bowlers WHERE id = ? LIMIT 1`, [input.id]);
    const eventId = rows[0]?.eventId;
    if (!eventId) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });
    await rawExec(
      `UPDATE bowlers SET legalFirstName=?, legalLastName=?, preferredName=?, email=?, phone=?, scantronId=?,
          registrationStatus=?, under21=?, isCapitain=?, tshirtSize=?, squadTime=?, laneNumber=?, squadTime2=?, laneNumber2=?, banquetTable=?, notes=?
       WHERE id=?`,
      [
        input.legalFirstName.trim(), input.legalLastName.trim(), cleanText(input.preferredName), cleanText(input.email), cleanText(input.phone),
        cleanText(input.scantronId), input.registrationStatus, input.under21 ? 1 : 0, input.isCapitain ? 1 : 0,
        cleanText(input.tshirtSize), cleanText(input.squadTime), input.laneNumber ?? null, cleanText(input.squadTime2),
        input.laneNumber2 ?? null, cleanText(input.banquetTable), cleanText(input.notes), input.id,
      ]
    );
    await writeAuditLog({ eventId, actorRole: "Owner", actorId: session.userId, action: "owner_update_bowler", targetId: input.id, targetType: "bowler", details: `Owner updated ${input.legalFirstName.trim()} ${input.legalLastName.trim()}` });
    return { success: true };
  }),

  deleteBowler: publicProcedure
    .input(z.object({ bowlerId: z.number().int().positive(), confirmation: z.literal("DELETE BOWLER") }))
    .mutation(async ({ input, ctx }) => {
      const session = await requireOwner(ctx);
      const rows = await rawQuery<{ eventId: number; legalFirstName: string; legalLastName: string }>(`SELECT eventId, legalFirstName, legalLastName FROM bowlers WHERE id = ? LIMIT 1`, [input.bowlerId]);
      const bowler = rows[0];
      if (!bowler) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });
      await deleteBowler(input.bowlerId);
      await writeAuditLog({ eventId: bowler.eventId, actorRole: "Owner", actorId: session.userId, action: "owner_delete_bowler", targetId: input.bowlerId, targetType: "bowler", details: `Owner permanently deleted ${bowler.legalFirstName} ${bowler.legalLastName}` });
      return { success: true };
    }),

  deleteEvent: publicProcedure
    .input(z.object({ eventId: z.number().int().positive(), confirmation: z.literal("DELETE EVENT") }))
    .mutation(async ({ input, ctx }) => {
      const session = await requireOwner(ctx);
      const events = await rawQuery<{ eventName: string }>(`SELECT eventName FROM events WHERE id = ? LIMIT 1`, [input.eventId]);
      if (!events[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      const bowlerSubquery = "SELECT id FROM bowlers WHERE eventId = ?";
      await rawExec(`DELETE FROM offline_sync_queue WHERE bowler_id IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM guest_pool_party_tokens WHERE bowlerId IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM payment_records WHERE bowlerId IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM entry_tokens WHERE bowlerId IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM checkIns WHERE bowlerId IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM contact_requests WHERE bowlerId IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM hotel_records WHERE bowlerId IN (${bowlerSubquery})`, [input.eventId]);
      await rawExec(`DELETE FROM ad_inquiries WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM advertisements WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM bowler_claim_codes WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM checkIns WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM contact_requests WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM door_scan_log WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM entry_tokens WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM gifts WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM guest_bowlers WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM guest_pool_party_tokens WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM survey_responses WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM paytable_entries WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM prize_pool WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM import_sessions WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM lane_assignments WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM laneAssignments WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM reentry_codes WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM reentry_tokens WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM team_payouts WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM wristbands WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM app_users WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM event_director_assignments WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM teams WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM leagues WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM bowlers WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM auditLog WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM events WHERE id = ?`, [input.eventId]);
      console.info(`[owner] User ${session.userId ?? "owner"} permanently deleted event ${input.eventId}: ${events[0].eventName}`);
      return { success: true };
    }),
});
