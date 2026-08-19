import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { deleteBowler, rawExec, rawQuery, writeAuditLog } from "../db";
import { requireOwner } from "../_core/edAuth";
import { publicProcedure, router } from "../_core/trpc";
import { groupEventDirectors } from "../ownerDirectorAssignments";
import { assessOwnerReadiness } from "../ownerDashboardLogic";
import { normalizeEventIds, portfolioMatchesCompany } from "../ownerOperationsLogic";
import { normalizeCoordinatorContactDetails } from "../coordinatorContactLogic";

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

const ownerEventCreateInput = z.object({
  eventName: z.string().trim().min(1).max(255),
  eventYear: z.number().int().min(2020).max(2100),
  companyId: z.number().int().positive(),
  groupSlug: z.string().trim().min(1).max(64),
  startDate: optionalText,
  endDate: optionalText,
  bowlingDate: optionalText,
  squadTime: optionalText,
  sheetSpreadsheetId: optionalText,
  sheetTabName: optionalText,
  sheetTabNickname: optionalText,
});

const ownerDirectorCreateInput = z.object({
  name: z.string().trim().min(1).max(128),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores, or hyphens."),
  password: z.string().min(8).max(128),
  companyId: z.number().int().positive(),
  eventIds: z.array(z.number().int().positive()).default([]),
});

const ownerDirectorAssignmentsInput = z.object({
  staffId: z.number().int().positive(),
  eventIds: z.array(z.number().int().positive()).default([]),
});

const coordinatorContactInput = z.object({
  eventId: z.number().int().positive(),
  coordinatorName: z.string().trim().min(1).max(255),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().or(z.literal("")).optional().nullable(),
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

type DirectorAssignmentRow = {
  eventId: number | string;
  staffId: number | string;
  name: string | null;
  username: string | null;
};

const asNumber = (value: number | string | null | undefined) => Number(value ?? 0);
const cleanText = (value: string | null | undefined) => value?.trim() || null;

async function validateOwnerPortfolio(companyId: number, eventIds: number[]) {
  const normalizedEventIds = normalizeEventIds(eventIds);
  if (!normalizedEventIds.length) return normalizedEventIds;
  const placeholders = normalizedEventIds.map(() => "?").join(",");
  const portfolio = await rawQuery<{ id: number; companyId: number | null }>(
    `SELECT id, companyId FROM events WHERE id IN (${placeholders})`,
    normalizedEventIds,
  );
  if (portfolio.length !== normalizedEventIds.length || !portfolioMatchesCompany(portfolio.map((event) => event.companyId), companyId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected event must belong to this Event Director's company." });
  }
  return normalizedEventIds;
}

export const ownerDashboardRouter = router({
  operationsData: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    const [companies, groups, directors, events] = await Promise.all([
      rawQuery<{ id: number; name: string; slug: string }>(`SELECT id, name, slug FROM companies ORDER BY name`),
      rawQuery<{ id: number; name: string; slug: string }>(`SELECT id, name, slug FROM event_groups ORDER BY name`),
      rawQuery<{ id: number; name: string; username: string; companyId: number; companyName: string | null }>(
        `SELECT s.id, s.name, s.username, s.companyId, c.name AS companyName
         FROM ed_staff s LEFT JOIN companies c ON c.id = s.companyId
         WHERE s.accessRole = 'event_director' ORDER BY c.name, s.name, s.username`
      ),
      rawQuery<{ id: number; eventName: string; eventYear: number; companyId: number | null; status: string }>(
        `SELECT id, eventName, eventYear, companyId, status FROM events ORDER BY eventYear DESC, id DESC`
      ),
    ]);
    const assignments = await rawQuery<{ staffId: number; eventId: number }>(`SELECT staffId, eventId FROM event_director_assignments`);
    const eventIdsByDirector = assignments.reduce<Record<number, number[]>>((groupsByDirector, assignment) => {
      (groupsByDirector[assignment.staffId] ??= []).push(assignment.eventId);
      return groupsByDirector;
    }, {});
    return { companies, groups, events, directors: directors.map((director) => ({ ...director, eventIds: eventIdsByDirector[director.id] ?? [] })) };
  }),

  createEvent: publicProcedure.input(ownerEventCreateInput).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    const [company] = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE id = ? LIMIT 1`, [input.companyId]);
    if (!company) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid company for the event." });
    const [group] = await rawQuery<{ id: number }>(`SELECT id FROM event_groups WHERE slug = ? LIMIT 1`, [input.groupSlug]);
    const created = await rawExec(
      `INSERT INTO events (companyId, groupId, groupSlug, eventName, eventYear, status, startDate, endDate, bowlingDate, squadTime, sheetSpreadsheetId, sheetTabName, sheetTabNickname)
       VALUES (?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?, ?, ?, ?)`,
      [input.companyId, group?.id ?? null, input.groupSlug, input.eventName.trim(), input.eventYear, cleanText(input.startDate), cleanText(input.endDate), cleanText(input.bowlingDate), cleanText(input.squadTime), cleanText(input.sheetSpreadsheetId), cleanText(input.sheetTabName), cleanText(input.sheetTabNickname)]
    );
    await writeAuditLog({ eventId: created.insertId, actorRole: "Owner", actorId: session.userId, action: "owner_create_event", targetId: created.insertId, targetType: "event", details: `Owner created planning event ${input.eventName.trim()} (${input.eventYear})` });
    return { success: true, eventId: created.insertId };
  }),

  createDirector: publicProcedure.input(ownerDirectorCreateInput).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    const [company] = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE id = ? LIMIT 1`, [input.companyId]);
    if (!company) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid company for the Event Director." });
    const [duplicate] = await rawQuery<{ id: number }>(`SELECT id FROM ed_staff WHERE LOWER(username) = LOWER(?) LIMIT 1`, [input.username]);
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "That Event Director username is already in use." });
    const eventIds = await validateOwnerPortfolio(input.companyId, input.eventIds);
    const result = await rawExec(`INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole, createdBy) VALUES (?, ?, ?, ?, 'event_director', ?)`, [input.username.trim(), await bcrypt.hash(input.password, 12), input.name.trim(), input.companyId, session.userId ?? null]);
    for (const eventId of eventIds) await rawExec(`INSERT INTO event_director_assignments (staffId, eventId) VALUES (?, ?)`, [result.insertId, eventId]);
    await writeAuditLog({ actorRole: "Owner", actorId: session.userId, action: "owner_create_event_director", targetId: result.insertId, targetType: "ed_staff", details: `Owner created Event Director ${input.name.trim()} (${input.username.trim()}) with ${eventIds.length} event assignment(s)` });
    return { success: true, staffId: result.insertId };
  }),

  setDirectorAssignments: publicProcedure.input(ownerDirectorAssignmentsInput).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    const [director] = await rawQuery<{ id: number; name: string; companyId: number | null; accessRole: string }>(`SELECT id, name, companyId, accessRole FROM ed_staff WHERE id = ? LIMIT 1`, [input.staffId]);
    if (!director || director.accessRole !== "event_director" || !director.companyId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid company-scoped Event Director." });
    const eventIds = await validateOwnerPortfolio(director.companyId, input.eventIds);
    await rawExec(`DELETE FROM event_director_assignments WHERE staffId = ?`, [input.staffId]);
    for (const eventId of eventIds) await rawExec(`INSERT INTO event_director_assignments (staffId, eventId) VALUES (?, ?)`, [input.staffId, eventId]);
    await writeAuditLog({ actorRole: "Owner", actorId: session.userId, action: "owner_set_event_director_assignments", targetId: input.staffId, targetType: "ed_staff", details: `Owner set ${eventIds.length} event assignment(s) for ${director.name}` });
    return { success: true };
  }),

  resetDirectorPassword: publicProcedure.input(z.object({ staffId: z.number().int().positive(), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    const [director] = await rawQuery<{ name: string; accessRole: string }>(`SELECT name, accessRole FROM ed_staff WHERE id = ? LIMIT 1`, [input.staffId]);
    if (!director || director.accessRole !== "event_director") throw new TRPCError({ code: "NOT_FOUND", message: "Event Director not found." });
    await rawExec(`UPDATE ed_staff SET passwordHash = ? WHERE id = ?`, [await bcrypt.hash(input.password, 12), input.staffId]);
    await writeAuditLog({ actorRole: "Owner", actorId: session.userId, action: "owner_reset_event_director_password", targetId: input.staffId, targetType: "ed_staff", details: `Owner reset the password for ${director.name}` });
    return { success: true };
  }),

  listCoordinatorContacts: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireOwner(ctx);
      return rawQuery<{ coordinatorName: string; phone: string | null; email: string | null }>(
        `SELECT source.coordinatorName, contact.phone, contact.email
         FROM (
           SELECT DISTINCT TRIM(coordinatorName) AS coordinatorName
           FROM teams WHERE eventId = ? AND coordinatorName IS NOT NULL AND TRIM(coordinatorName) <> ''
           UNION
           SELECT coordinatorName FROM event_coordinator_contacts WHERE eventId = ?
         ) source
         LEFT JOIN event_coordinator_contacts contact ON contact.eventId = ? AND contact.coordinatorName = source.coordinatorName
         ORDER BY source.coordinatorName`,
        [input.eventId, input.eventId, input.eventId],
      );
    }),

  saveCoordinatorContact: publicProcedure.input(coordinatorContactInput).mutation(async ({ input, ctx }) => {
    const session = await requireOwner(ctx);
    const [event] = await rawQuery<{ id: number }>(`SELECT id FROM events WHERE id = ? LIMIT 1`, [input.eventId]);
    if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
    const coordinatorName = input.coordinatorName.trim();
    const contact = normalizeCoordinatorContactDetails(input.phone, input.email);
    if (!contact.phone && !contact.email) {
      await rawExec(`DELETE FROM event_coordinator_contacts WHERE eventId = ? AND coordinatorName = ?`, [input.eventId, coordinatorName]);
    } else {
      await rawExec(
        `INSERT INTO event_coordinator_contacts (eventId, coordinatorName, phone, email)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE phone = VALUES(phone), email = VALUES(email)`,
        [input.eventId, coordinatorName, contact.phone, contact.email],
      );
    }
    await writeAuditLog({ eventId: input.eventId, actorRole: "Owner", actorId: session.userId, action: "owner_save_coordinator_contact", targetType: "event_coordinator_contact", details: `Owner saved contact details for coordinator ${coordinatorName}` });
    return { success: true };
  }),

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
    const directorRows = await rawQuery<DirectorAssignmentRow>(
      `SELECT eda.eventId, s.id AS staffId, s.name, s.username
       FROM event_director_assignments eda
       JOIN ed_staff s ON s.id = eda.staffId
       ORDER BY s.name, s.username`
    );
    const directorsByEvent = groupEventDirectors(directorRows);
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
      return {
        ...row,
        directors: directorsByEvent[Number(row.id)] ?? [],
        ...metrics,
        readiness: assessOwnerReadiness(metrics),
      };
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
      await rawExec(`DELETE FROM event_coordinator_contacts WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM teams WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM leagues WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM bowlers WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM auditLog WHERE eventId = ?`, [input.eventId]);
      await rawExec(`DELETE FROM events WHERE id = ?`, [input.eventId]);
      console.info(`[owner] User ${session.userId ?? "owner"} permanently deleted event ${input.eventId}: ${events[0].eventName}`);
      return { success: true };
    }),
});
