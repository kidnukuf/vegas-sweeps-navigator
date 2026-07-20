import { z } from "zod";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "@shared/const";
import { bowlerAuthRouter } from "./routers/bowlerAuth";
import { offlineDoorRouter } from "./routers/offlineDoor";
import { claimCodesRouter } from "./routers/claimCodes";
import { adInquiryRouter } from "./routers/adInquiry";
import { masterSheetRouter } from "./routers/masterSheet";
import { emailInvitationRouter } from "./routers/emailInvitation";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { broadcastTokenInvalidation } from "./_core/sse";
import {
  getAllCenters, getActiveEvent, getAllEvents, getEventById, getEventSheetTarget, updateEventSheetTarget, createEvent, renameEvent, deleteBowler, getLeaguesByEvent, getTeamsByCenter,
  getBowlersByTeam, getBowlerById, getBowlerByScantronId, searchBowlers,
  matchBowlerForSignup, updateBowlerRegistrationStatus, updateBowler,
  getAllBowlersForAdmin, getAdminStats, getAppUserByUsername, createAppUser,
  getDoormanAccounts, createEntryToken, getTokenByValue, invalidateToken,
  getBowlerActiveToken, createCheckIn, issueWristband, getWristbandByBowler,
  denyWristband, writeAuditLog, getAuditLog, createImportSession,
  updateImportSession, getImportHistory, upsertHotelRecord, upsertPaymentRecord,
  rawQuery, updateTeamStatus, getTeamById, recordSheetSync,
} from "./db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import QRCode from "qrcode";
import { writeBowlerIdToSheet, writeQRCodesToSheet, markTshirtReceivedInSheet } from "./googleSheets";
import { storagePut } from "./storage";
import { v4 as uuidv4 } from "uuid";

const APP_ORIGIN = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";

// ─── ID GENERATION ────────────────────────────────────────────────────────────
export function generateScantronId(cc: string, l: string, ee: string, tt: string, bb: string): string {
  const id = `${cc.padStart(2, "0")}${l.padStart(1, "0")}${ee.padStart(2, "0")}${tt.padStart(2, "0")}${bb.padStart(2, "0")}`;
  if (id === "0000000000") throw new Error("Reserved test ID — regenerate");
  return id;
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────
export const appRouter = router({
  masterSheet: masterSheetRouter,
  system: systemRouter,
  emailInvitation: emailInvitationRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── CENTERS ──────────────────────────────────────────────────────────────
  centers: router({
    list: publicProcedure.query(async () => {
      return getAllCenters();
    }),
  }),

  // ─── EVENT ────────────────────────────────────────────────────────────────
  event: router({
    active: publicProcedure.query(async () => {
      return getActiveEvent();
    }),
    list: publicProcedure.query(async () => {
      return getAllEvents();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getEventById(input.id);
      }),
    create: publicProcedure
      .input(z.object({
        eventName: z.string().min(1),
        eventYear: z.number().int(),
        actorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createEvent(input.eventName, input.eventYear);
        await writeAuditLog({
          eventId: id,
          actorRole: "EventDirector",
          actorId: input.actorId,
          action: "create_event",
          targetId: id,
          targetType: "event",
          details: `${input.eventName} (${input.eventYear})`,
        });
        return { success: true, id };
      }),
    rename: publicProcedure
      .input(z.object({
        id: z.number(),
        eventName: z.string().min(1),
        eventYear: z.number().int().optional(),
        actorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await renameEvent(input.id, input.eventName, input.eventYear);
        await writeAuditLog({
          eventId: input.id,
          actorRole: "EventDirector",
          actorId: input.actorId,
          action: "rename_event",
          targetId: input.id,
          targetType: "event",
          details: `${input.eventName}${input.eventYear ? ` (${input.eventYear})` : ""}`,
        });
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ eventId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { eventId } = input;
        // Verified against live DB tables (June 24 2026):
        // Exists: guest_pool_party_tokens, offline_sync_queue, payment_records, entry_tokens,
        //         checkIns, contact_requests, hotel_records, hotelRecords, auditLog, app_users,
        //         lane_assignments, laneAssignments, import_sessions, teams, leagues, bowlers, events
        // Does NOT exist: redemptions, wristbands (skip these)
        // support_messages has no eventId column (skip event-scoped delete)
        const bowlerSubquery = 'SELECT id FROM bowlers WHERE eventId=?';
        await rawQuery(`DELETE FROM guest_pool_party_tokens WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM offline_sync_queue WHERE bowler_id IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM payment_records WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM entry_tokens WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM checkIns WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM contact_requests WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM hotel_records WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery(`DELETE FROM hotelRecords WHERE bowlerId IN (${bowlerSubquery})`, [eventId]);
        await rawQuery('DELETE FROM auditLog WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM app_users WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM lane_assignments WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM laneAssignments WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM import_sessions WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM teams WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM leagues WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM bowlers WHERE eventId=?', [eventId]);
        await rawQuery('DELETE FROM events WHERE id=?', [eventId]);
        return { success: true };
      }),
    listGroups: publicProcedure.query(async () => {
      return rawQuery(`SELECT * FROM event_groups ORDER BY id`) as Promise<Record<string, unknown>[]>;
    }),
    listByGroup: publicProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        return rawQuery(
          `SELECT * FROM events WHERE groupId = ? ORDER BY sortOrder, id`,
          [input.groupId]
        ) as Promise<Record<string, unknown>[]>;
      }),
    listByGroupSlug: publicProcedure
      .input(z.object({ groupSlug: z.string() }))
      .query(async ({ input }) => {
        return rawQuery(
          `SELECT * FROM events WHERE groupSlug = ? ORDER BY sortOrder, id`,
          [input.groupSlug]
        ) as Promise<Record<string, unknown>[]>;
      }),
    activeByGroupSlug: publicProcedure
      .input(z.object({ groupSlug: z.string() }))
      .query(async ({ input }) => {
        // Return the most recent active or planning event for this group slug
        const rows = await rawQuery(
          `SELECT * FROM events WHERE groupSlug = ? ORDER BY FIELD(status,'active','planning','completed'), sortOrder, id LIMIT 1`,
          [input.groupSlug]
        ) as Record<string, unknown>[];
        return rows[0] ?? null;
      }),
    createInGroup: publicProcedure
      .input(z.object({
        groupId: z.number(),
        eventName: z.string().min(1),
        eventYear: z.number().int(),
        sortOrder: z.number().optional(),
        actorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await rawQuery(
          `INSERT INTO events (groupId, eventName, eventYear, status, sortOrder) VALUES (?, ?, ?, 'planning', ?)`,
          [input.groupId, input.eventName, input.eventYear, input.sortOrder ?? 0]
        ) as unknown as Record<string, unknown>;
        const id = (result as any).insertId as number;
        await writeAuditLog({
          eventId: id,
          actorRole: "EventDirector",
          actorId: input.actorId,
          action: "create_event",
          targetId: id,
          targetType: "event",
          details: `${input.eventName} (${input.eventYear}) in group ${input.groupId}`,
        });
        return { success: true, id };
      }),
    // Update banquet info for an event (location + time apply to ALL bowlers in that event)
    updateBanquetInfo: publicProcedure
      .input(z.object({
        id: z.number(),
        banquetLocation: z.string().optional(),
        banquetTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await rawQuery(
          `UPDATE events SET banquetLocation=?, banquetTime=? WHERE id=?`,
          [input.banquetLocation ?? null, input.banquetTime ?? null, input.id]
        );
        return { success: true };
      }),
    // Get banquet info for an event
    getBanquetInfo: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const rows = await rawQuery(
          `SELECT banquetLocation, banquetTime FROM events WHERE id=?`,
          [input.id]
        ) as Record<string, unknown>[];
        return { banquetLocation: rows[0]?.banquetLocation ?? null, banquetTime: rows[0]?.banquetTime ?? null };
      }),

    // ─── EVENT WIZARD SETTINGS (Section 1) ────────────────────────────────
    // Full set of event-customization fields driving the bowler/captain portals.
    getSettings: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const rows = await rawQuery(
          `SELECT id, eventName, eventYear,
             hotelCheckinDay, hotelCheckinTime, registrationDay, registrationTime,
             tshirtsProvided, tshirtPickupLocation, tshirtPickupTime,
             poolPartyEnabled, poolPartyTime, banquetDay, banquetTime, banquetLocation,
             hotelCheckoutDay, hotelCheckoutTime, surveyEnabled, surveyOpen, showHotelInfoCard,
             sheetSpreadsheetId, sheetTabName, sheetTabNickname, sheetLastSyncedAt
           FROM events WHERE id=?`,
          [input.id]
        ) as Record<string, unknown>[];
        return rows[0] ?? null;
      }),
    updateSettings: publicProcedure
      .input(z.object({
        id: z.number(),
        eventName: z.string().min(1).optional(),
        eventYear: z.number().int().optional(),
        hotelCheckinDay: z.string().optional().nullable(),
        hotelCheckinTime: z.string().optional().nullable(),
        registrationDay: z.string().optional().nullable(),
        registrationTime: z.string().optional().nullable(),
        tshirtsProvided: z.boolean().optional(),
        tshirtPickupLocation: z.string().optional().nullable(),
        tshirtPickupTime: z.string().optional().nullable(),
        poolPartyEnabled: z.boolean().optional(),
        poolPartyTime: z.string().optional().nullable(),
        banquetDay: z.string().optional().nullable(),
        banquetTime: z.string().optional().nullable(),
        banquetLocation: z.string().optional().nullable(),
        hotelCheckoutDay: z.string().optional().nullable(),
        hotelCheckoutTime: z.string().optional().nullable(),
        surveyEnabled: z.boolean().optional(),
        surveyOpen: z.boolean().optional(),
        showHotelInfoCard: z.boolean().optional(),
        sheetSpreadsheetId: z.string().optional().nullable(),
        sheetTabName: z.string().optional().nullable(),
        sheetTabNickname: z.string().optional().nullable(),
        actorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const fields: string[] = [];
        const values: unknown[] = [];
        const map: Record<string, unknown> = {
          eventName: input.eventName,
          eventYear: input.eventYear,
          hotelCheckinDay: input.hotelCheckinDay,
          hotelCheckinTime: input.hotelCheckinTime,
          registrationDay: input.registrationDay,
          registrationTime: input.registrationTime,
          tshirtsProvided: input.tshirtsProvided,
          tshirtPickupLocation: input.tshirtPickupLocation,
          tshirtPickupTime: input.tshirtPickupTime,
          poolPartyEnabled: input.poolPartyEnabled,
          poolPartyTime: input.poolPartyTime,
          banquetDay: input.banquetDay,
          banquetTime: input.banquetTime,
          banquetLocation: input.banquetLocation,
          hotelCheckoutDay: input.hotelCheckoutDay,
          hotelCheckoutTime: input.hotelCheckoutTime,
          surveyEnabled: input.surveyEnabled,
          surveyOpen: input.surveyOpen,
          showHotelInfoCard: input.showHotelInfoCard,
          sheetSpreadsheetId: input.sheetSpreadsheetId,
          sheetTabName: input.sheetTabName,
          sheetTabNickname: input.sheetTabNickname,
        };
        for (const [key, val] of Object.entries(map)) {
          if (val !== undefined) {
            fields.push(`\`${key}\`=?`);
            values.push(typeof val === "boolean" ? (val ? 1 : 0) : val);
          }
        }
        if (fields.length === 0) return { success: true };
        values.push(input.id);
        await rawQuery(`UPDATE events SET ${fields.join(", ")} WHERE id=?`, values);
        await writeAuditLog({
          eventId: input.id,
          actorRole: "EventDirector",
          actorId: input.actorId,
          action: "update_event_settings",
          targetId: input.id,
          targetType: "event",
          details: `Updated ${fields.length} settings`,
        });
        return { success: true };
      }),

    getSheetTabs: publicProcedure
      .input(z.object({ spreadsheetId: z.string() }))
      .query(async ({ input }) => {
        // Fetch live tab names from the Google Sheet
        const { getSheetsClient, resolveSheetTarget } = await import('./googleSheets');
        const target = resolveSheetTarget({ spreadsheetId: input.spreadsheetId, sheetName: null });
        if (!target.spreadsheetId) return { tabs: [] };
        try {
          const sheets = await getSheetsClient();
          if (!sheets) return { tabs: [] };
          const res = await sheets.spreadsheets.get({
            spreadsheetId: target.spreadsheetId,
            fields: 'sheets.properties.title',
          });
          const tabs = (res.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter((t): t is string => Boolean(t));
          return { tabs };
        } catch (err) {
          console.error('[getSheetTabs] Failed to fetch tabs:', err);
          return { tabs: [] };
        }
      }),

    verifyTabHeaders: publicProcedure
      .input(z.object({ spreadsheetId: z.string(), tabName: z.string() }))
      .query(async ({ input }) => {
        const EXPECTED_HEADERS = [
          "Bowler ID", "Phone", "Email", "Squad Day & Time", "Lane #", "Center",
          "Coordinator", "Team #", "Captain", "First Name", "Last Name", "Under 21?",
          "Sanction #", "# Games", "Best Avg", "Team Name", "League Member", "T-Shirt Size",
          "Hotel Confirmation", "Check In", "Check Out", "Roommate First Name", "Roommate Last Name",
          "2nd Squad Time", "Lane #", "Pool QR", "Pool Used", "Banquet QR", "Banquet Used",
          "#A Pool QR", "#A Pool Used", "#A Banquet QR", "#A Banquet Used",
          "#B Pool QR", "#B Pool Used", "#B Banquet QR", "#B Banquet Used",
          "2nd Banquet QR", "2nd Banquet Used", "2nd Pool QR", "2nd Pool Used",
          "Q1 Overall Experience?", "Q1 answer ", "Q2 Bowling Venue?", "Q2 Answer ",
          "Q3 Event Organization?", "Q3 Answer ", "Q4 Pool Party? (If applicable)", "Q4 Answer ",
          "Q5 Banquet Experience?", "Q5 Answer ", "Q6 This App?", "Q6 Answer ",
          "Q7 League App Interest?", "Q7 Answer ",
          "Q8 Additional Comments or Concerns", "Q8 Answer",
          "Q9 Testimonial Permission?", "Q9 Answer ", "Q10 Attend Next Year?", "Q10 Answer ",
        ];
        const { getSheetsClient } = await import('./googleSheets');
        try {
          const sheets = await getSheetsClient();
          if (!sheets) return { ok: false, error: 'Could not connect to Google Sheets', mismatches: [], totalExpected: EXPECTED_HEADERS.length, totalFound: 0 };
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: input.spreadsheetId,
            range: `${input.tabName}!1:1`,
          });
          const actual: string[] = (res.data.values?.[0] ?? []).map((v: unknown) => String(v ?? ''));
          const mismatches: { col: number; expected: string; actual: string }[] = [];
          for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
            const found = actual[i] ?? '';
            if (found !== EXPECTED_HEADERS[i]) {
              mismatches.push({ col: i, expected: EXPECTED_HEADERS[i], actual: found || '(missing)' });
            }
          }
          return { ok: mismatches.length === 0, error: null, mismatches, totalExpected: EXPECTED_HEADERS.length, totalFound: actual.length };
        } catch (err: any) {
          return { ok: false, error: err?.message ?? 'Unknown error', mismatches: [], totalExpected: EXPECTED_HEADERS.length, totalFound: 0 };
        }
      }),
  }),

  // ─── BOWLERS ──────────────────────────────────────────────────────────────
  bowlers: router({
    search: publicProcedure
      .input(z.object({ query: z.string(), eventId: z.number().optional() }))
      .query(async ({ input }) => {
        if (!input.query || input.query.length < 2) return [];
        return searchBowlers(input.query, input.eventId);
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getBowlerById(input.id);
      }),

    getByScantronId: publicProcedure
      .input(z.object({ scantronId: z.string() }))
      .query(async ({ input }) => {
        return getBowlerByScantronId(input.scantronId);
      }),

    adminList: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return getAllBowlersForAdmin(input.eventId);
      }),

    stats: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return getAdminStats(input.eventId);
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        fields: z.record(z.string(), z.unknown()),
        actorRole: z.string().optional(),
        actorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const HOTEL_FIELDS = ["checkinDate","checkoutDate","roomType","roomNumber","roommateRequested","roommateFirstName","roommateLastName","roomAmount","confirmationCode"];
        const PAYMENT_FIELDS = ["banquetAmount","poolParty","totalAmountDue","paid"];
        const bowlerFields: Record<string, unknown> = {};
        const hotelFields: Record<string, unknown> = {};
        const paymentFields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input.fields)) {
          if (HOTEL_FIELDS.includes(k)) hotelFields[k] = v;
          else if (PAYMENT_FIELDS.includes(k)) paymentFields[k] = v;
          else bowlerFields[k] = v;
        }
        if (Object.keys(bowlerFields).length > 0) await updateBowler(input.id, bowlerFields);
        if (Object.keys(hotelFields).length > 0) await upsertHotelRecord(input.id, hotelFields);
        if (Object.keys(paymentFields).length > 0) await upsertPaymentRecord(input.id, paymentFields);
        await writeAuditLog({
          actorRole: input.actorRole ?? "EventDirector",
          actorId: input.actorId,
          action: "update_bowler",
          targetId: input.id,
          targetType: "bowler",
          details: JSON.stringify(Object.keys(input.fields)),
        });
        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        id: z.number(),
        actorRole: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateBowler(input.id, { passwordHash: null, registrationStatus: "pre_registered" });
        await writeAuditLog({
          actorRole: input.actorRole ?? "EventDirector",
          action: "reset_password",
          targetId: input.id,
          targetType: "bowler",
          details: "Password cleared by Event Director",
        });
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({
        id: z.number(),
        actorRole: z.string().optional(),
        actorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const bowler = await getBowlerById(input.id) as Record<string, unknown> | null;
        const label = bowler
          ? `${bowler.legalFirstName ?? ""} ${bowler.legalLastName ?? ""} (scantronId=${bowler.scantronId ?? "n/a"})`.trim()
          : `bowler #${input.id}`;
        // Log BEFORE deletion so the audit trail retains the record.
        await writeAuditLog({
          eventId: (bowler?.eventId as number) ?? undefined,
          actorRole: input.actorRole ?? "EventDirector",
          actorId: input.actorId,
          action: "delete_bowler",
          targetId: input.id,
          targetType: "bowler",
          details: `PERMANENTLY DELETED: ${label}`,
        });
        await deleteBowler(input.id);
        return { success: true };
      }),

    matchForSignup: publicProcedure
      .input(z.object({
        phone: z.string().optional().default(""),
        email: z.string().optional().default(""),
        firstName: z.string(),
        lastName: z.string(),
        centerId: z.number().optional(),
        eventId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return matchBowlerForSignup(input.phone, input.email, input.firstName, input.lastName);
      }),

    linkSignup: publicProcedure
      .input(z.object({
        bowlerId: z.number(),
        appUserId: z.number().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const fields: Record<string, unknown> = { registrationStatus: "signed_up" };
        if (input.phone) fields.phone = input.phone;
        if (input.email) fields.email = input.email;
        if (input.appUserId) fields.appUserId = input.appUserId;
        await updateBowler(input.bowlerId, fields);
        await writeAuditLog({
          actorRole: "Bowler",
          actorId: input.bowlerId,
          action: "signup_linked",
          targetId: input.bowlerId,
          targetType: "bowler",
        });
        return { success: true };
      }),

    createUnmatched: publicProcedure
      .input(z.object({
        firstName: z.string(),
        lastName: z.string(),
        phone: z.string(),
        email: z.string(),
        eventId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await rawQuery(
          "INSERT INTO bowlers (legalFirstName, legalLastName, phone, email, eventId, registrationStatus) VALUES (?, ?, ?, ?, ?, 'unmatched')",
          [input.firstName, input.lastName, input.phone, input.email, input.eventId]
        );
        await writeAuditLog({
          actorRole: "Bowler",
          action: "signup_unmatched",
          details: `${input.firstName} ${input.lastName} - ${input.phone}`,
        });
        return { success: true };
      }),

    captainVerify: publicProcedure
      .input(z.object({ bowlerId: z.number(), captainId: z.number() }))
      .mutation(async ({ input }) => {
        await updateBowler(input.bowlerId, { captainVerified: true, registrationStatus: "verified" });
        // Check if whole team is verified → update team status
        const bowler = await getBowlerById(input.bowlerId) as Record<string, unknown> | null;
        if (bowler?.teamId) {
          const teamMembers = await getBowlersByTeam(bowler.teamId as number) as Record<string, unknown>[];
          const allVerified = teamMembers.every((b) => b.captainVerified === 1 || b.captainVerified === true);
          const allSignedUp = teamMembers.every((b) => b.registrationStatus !== "pre_registered");
          if (allVerified && allSignedUp) {
            await updateTeamStatus(bowler.teamId as number, "green");
          } else if (allSignedUp) {
            await updateTeamStatus(bowler.teamId as number, "yellow");
          }
        }
        await writeAuditLog({
          actorRole: "TeamCaptain",
          actorId: input.captainId,
          action: "captain_verified_bowler",
          targetId: input.bowlerId,
          targetType: "bowler",
        });
        return { success: true };
      }),
  }),

  // ─── TEAMS ────────────────────────────────────────────────────────────────
  teams: router({
    // List all teams for an event
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return rawQuery('SELECT t.*, bc.centerName FROM teams t JOIN bowling_centers bc ON t.centerId=bc.id WHERE t.eventId=? ORDER BY bc.centerName, t.teamCode', [input.eventId]);
      }),

    // Get team with its members
    getWithMembers: publicProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ input }) => {
        const team = await getTeamById(input.teamId) as unknown as Record<string, unknown>;
        const members = await getBowlersByTeam(input.teamId);
        return { team, members };
      }),

    // Verify captain code
    verifyCaptain: publicProcedure
      .input(z.object({ teamId: z.number(), captainCode: z.string() }))
      .mutation(async ({ input }) => {
        const team = await getTeamById(input.teamId) as Record<string, unknown> | null;
        if (!team) return { success: false, error: 'Team not found' };
        if (!team.captainCode) return { success: false, error: 'No captain code set for this team' };
        const valid = team.captainCode === input.captainCode;
        if (!valid) return { success: false, error: 'Invalid captain code' };
        return { success: true };
      }),

    // Captain verifies a member
    verifyMember: publicProcedure
      .input(z.object({ bowlerId: z.number(), captainTeamId: z.number() }))
      .mutation(async ({ input }) => {
        await rawQuery("UPDATE bowlers SET registrationStatus='verified' WHERE id=? AND teamId=?", [input.bowlerId, input.captainTeamId]);
        await writeAuditLog({ actorRole: 'TeamCaptain', action: 'member_verified', targetId: input.bowlerId, targetType: 'bowler' });
        return { success: true };
      }),

    byCenter: publicProcedure
      .input(z.object({ centerId: z.number(), eventId: z.number() }))
      .query(async ({ input }) => {
        return getTeamsByCenter(input.centerId, input.eventId);
      }),

    withBowlers: publicProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ input }) => {
        const team = await getTeamById(input.teamId);
        const bowlers = await getBowlersByTeam(input.teamId);
        return { team, bowlers };
      }),
  }),

  // ─── APP USERS (role accounts) ────────────────────────────────────────────
  appAuth: router({
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const user = await getAppUserByUsername(input.username) as Record<string, unknown> | null;
        if (!user) return { success: false, error: "Invalid credentials" };
        const valid = await bcrypt.compare(input.password, user.passwordHash as string);
        if (!valid) return { success: false, error: "Invalid credentials" };
        await writeAuditLog({
          actorRole: user.appRole as string,
          actorId: user.id as number,
          action: "login",
          details: `${user.designation} logged in`,
        });
        const token = jwt.sign({ userId: user.id, appRole: user.appRole, designation: user.designation }, process.env.JWT_SECRET ?? "dev-secret", { expiresIn: "12h" });
        // Set session cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, token, user: { id: user.id, username: user.username, designation: user.designation, appRole: user.appRole, bowlerId: user.bowlerId, teamId: user.teamId, leagueId: user.leagueId, eventId: user.eventId } };
      }),

    createDoorman: publicProcedure
      .input(z.object({
        designation: z.string(),
        password: z.string(),
        eventId: z.number(),
        createdBy: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const username = input.designation.toLowerCase();
        const passwordHash = await bcrypt.hash(input.password, 10);
        await createAppUser({
          username,
          designation: input.designation,
          appRole: "Doorman",
          passwordHash,
          eventId: input.eventId,
          createdBy: input.createdBy,
        });
        await writeAuditLog({
          actorRole: "EventDirector",
          actorId: input.createdBy,
          action: "create_doorman",
          details: `Created ${input.designation}`,
        });
        return { success: true };
      }),

    listDoormen: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return getDoormanAccounts(input.eventId);
      }),

    // Doorman login by username+password
    doormanLogin: publicProcedure
      .input(z.object({ designation: z.string(), password: z.string() }))
      .mutation(async ({ input }) => {
        // Accept either username (case-insensitive) or legacy designation lookup
        let user = await getAppUserByUsername(input.designation) as Record<string, unknown> | null;
        if (!user) user = await getAppUserByUsername(input.designation.toLowerCase()) as Record<string, unknown> | null;
        if (!user || user.appRole !== 'Doorman') return { success: false, error: 'Invalid credentials' };
        const valid = await bcrypt.compare(input.password, user.passwordHash as string);
        if (!valid) return { success: false, error: 'Invalid credentials' };
        const token = crypto.randomBytes(16).toString('hex');
        await writeAuditLog({ actorRole: 'Doorman', actorId: user.id as number, action: 'doorman_login', details: `${input.designation} logged in` });
        return { success: true, token, designation: user.designation, doormanId: user.id };
      }),

    // Bowler claims their pre-generated record
    claimBowler: publicProcedure
      .input(z.object({ bowlerId: z.number(), email: z.string(), password: z.string(), phone: z.string().optional() }))
      .mutation(async ({ input }) => {
        const bowler = await getBowlerById(input.bowlerId) as Record<string, unknown> | null;
        if (!bowler) throw new Error('Bowler not found');
        if (bowler.appUserId) throw new Error('This record has already been claimed');
        const username = input.email.toLowerCase();
        const passwordHash = await bcrypt.hash(input.password, 10);
        await createAppUser({ username, designation: username, appRole: 'Bowler', passwordHash, bowlerId: input.bowlerId, eventId: bowler.eventId as number });
        const newUser = await getAppUserByUsername(username) as unknown as Record<string, unknown>;
        await rawQuery('UPDATE bowlers SET appUserId=?, registrationStatus=?, phone=COALESCE(?,phone) WHERE id=?', [newUser.id, 'signed_up', input.phone || null, input.bowlerId]);
        await writeAuditLog({ actorRole: 'Bowler', actorId: input.bowlerId, action: 'bowler_claimed', targetId: input.bowlerId, targetType: 'bowler', details: `Claimed by ${input.email}` });
        return { success: true, scantronId: bowler.scantronId, bowlerId: input.bowlerId };
      }),
  }),

  // ─── TABLET PIN (doorman tablet mode) ─────────────────────────────────────
  setTabletPin: publicProcedure
    .input(z.object({ eventId: z.number(), pin: z.string().min(4).max(6) }))
    .mutation(async ({ input }) => {
      await rawQuery('UPDATE events SET tabletPin=? WHERE id=?', [input.pin, input.eventId]);
      return { success: true };
    }),

  getTabletPin: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const rows = await rawQuery('SELECT tabletPin FROM events WHERE id=?', [input.eventId]) as Record<string, unknown>[];
      return { pin: rows[0]?.tabletPin ?? null };
    }),

  // ─── QR TOKENS ────────────────────────────────────────────────────────────
  tokens: router({
    generate: publicProcedure
      .input(z.object({ bowlerId: z.number(), eventId: z.number() }))
      .mutation(async ({ input }) => {
        // Check for existing active token
        const existing = await getBowlerActiveToken(input.bowlerId, input.eventId) as Record<string, unknown> | null;
        if (existing) {
          const qrDataUrl = await QRCode.toDataURL(existing.tokenValue as string, { width: 300, margin: 2 });
          return { tokenValue: existing.tokenValue, qrDataUrl };
        }
        const tokenValue = crypto.randomBytes(32).toString("hex");
        await createEntryToken(input.bowlerId, input.eventId, tokenValue, "initial");
        const qrDataUrl = await QRCode.toDataURL(tokenValue, { width: 300, margin: 2 });
        return { tokenValue, qrDataUrl };
      }),

    generateTest: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async () => {
        const testTokenValue = "TEST-0000000000-" + Date.now();
        const qrDataUrl = await QRCode.toDataURL(testTokenValue, {
          width: 300, margin: 2,
          color: { dark: "#ffd700", light: "#1a1a1a" }
        });
        return { tokenValue: testTokenValue, qrDataUrl, isTest: true };
      }),

    // Get active token for a bowler (for profile QR display)
    getForBowler: publicProcedure
      .input(z.object({ bowlerId: z.number() }))
      .query(async ({ input }) => {
        const token = await getBowlerActiveToken(input.bowlerId, 1) as Record<string, unknown> | null;
        if (!token) return null;
        const qrDataUrl = await QRCode.toDataURL(token.tokenValue as string, { width: 250, margin: 2 });
        return { ...token, qrDataUrl };
      }),

    validate: publicProcedure
      .input(z.object({
        tokenValue: z.string(),
        doormanId: z.number().optional(),
        method: z.enum(["QR", "PIN", "manual"]).default("QR"),
      }))
      .mutation(async ({ input }) => {
        // Test token handling
        if (input.tokenValue.startsWith("TEST-0000000000-")) {
          await writeAuditLog({
            actorRole: "Doorman",
            actorId: input.doormanId,
            action: "qr_test_scan",
            details: `Test QR scanned: ${input.tokenValue}`,
          });
          return { success: true, isTest: true, message: "TEST QR — SYSTEM WORKING ✓" };
        }

        const token = await getTokenByValue(input.tokenValue) as Record<string, unknown> | null;
        if (!token) {
          await writeAuditLog({
            actorRole: "Doorman",
            actorId: input.doormanId,
            action: "checkin_denied_not_found",
            details: `Token not found: ${input.tokenValue}`,
          });
          return { success: false, error: "DENIED — NOT FOUND" };
        }
        if (token.isUsed) {
          await writeAuditLog({
            actorRole: "Doorman",
            actorId: input.doormanId,
            action: "checkin_denied_already_used",
            targetId: token.bowlerId as number,
            targetType: "bowler",
          });
          return { success: false, error: "DENIED — ALREADY USED" };
        }

        // Atomic: invalidate token + create check-in
        await invalidateToken(token.id as number);
        await createCheckIn(token.bowlerId as number, token.eventId as number, input.method, input.doormanId, token.id as number);
        const bowler = await getBowlerById(token.bowlerId as number);
        const bowlerName = bowler ? `${(bowler as Record<string,unknown>).legalFirstName} ${(bowler as Record<string,unknown>).legalLastName}` : undefined;
        await writeAuditLog({
          eventId: token.eventId as number,
          actorRole: "Doorman",
          actorId: input.doormanId,
          action: "checkin_success",
          targetId: token.bowlerId as number,
          targetType: "bowler",
          details: `Method: ${input.method}`,
        });
        // Broadcast to all connected doorman tablets via SSE
        try { broadcastTokenInvalidation({ tokenValue: input.tokenValue, bowlerName }); } catch { /* non-fatal */ }
        return { success: true, bowler, bowlerName };
      }),
  }),

  // ─── WRISTBANDS ───────────────────────────────────────────────────────────
  wristbands: router({
    issue: publicProcedure
      .input(z.object({
        bowlerId: z.number(),
        eventId: z.number(),
        doormanId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const existing = await getWristbandByBowler(input.bowlerId, input.eventId) as Record<string, unknown> | null;
        if (existing) return { success: false, error: "Wristband already issued" };
        // Generate reentry token
        const reentryTokenValue = "REENTRY-" + crypto.randomBytes(24).toString("hex");
        await createEntryToken(input.bowlerId, input.eventId, reentryTokenValue, "reentry");
        const reentryToken = await getTokenByValue(reentryTokenValue) as Record<string, unknown> | null;
        await issueWristband(input.bowlerId, input.eventId, input.doormanId, reentryToken?.id as number | undefined);
        const reentryQr = await QRCode.toDataURL(reentryTokenValue, { width: 250, margin: 2 });
        await writeAuditLog({
          eventId: input.eventId,
          actorRole: "Doorman",
          actorId: input.doormanId,
          action: "wristband_issued",
          targetId: input.bowlerId,
          targetType: "bowler",
        });
        return { success: true, reentryTokenValue, reentryQr };
      }),

    deny: publicProcedure
      .input(z.object({
        bowlerId: z.number(),
        eventId: z.number(),
        doormanId: z.number(),
        reason: z.string(),
      }))
      .mutation(async ({ input }) => {
        const wb = await getWristbandByBowler(input.bowlerId, input.eventId) as Record<string, unknown> | null;
        if (wb) await denyWristband(wb.id as number, input.reason);
        await writeAuditLog({
          eventId: input.eventId,
          actorRole: "Doorman",
          actorId: input.doormanId,
          action: "wristband_denied",
          targetId: input.bowlerId,
          targetType: "bowler",
          details: input.reason,
        });
        return { success: true };
      }),

    getByBowler: publicProcedure
      .input(z.object({ bowlerId: z.number(), eventId: z.number() }))
      .query(async ({ input }) => {
        return getWristbandByBowler(input.bowlerId, input.eventId);
      }),
  }),

  // ─── T-SHIRTS (captain marks batch received → purple sheet cell) ───────────
  tshirts: router({
    // Captain marks their team's T-shirt batch as picked up.
    markReceived: publicProcedure
      .input(z.object({
        bowlerId: z.number(),
        received: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const rows = await rawQuery<{
          id: number; legalFirstName: string; legalLastName: string;
          laneNumber: number | null; isCaptain: number; eventId: number | null;
        }>(
          `SELECT id, legalFirstName, legalLastName, laneNumber, isCaptain, eventId
           FROM bowlers WHERE id = ? LIMIT 1`,
          [input.bowlerId]
        );
        if (!rows[0]) throw new Error("Bowler not found");
        const b = rows[0];
        const now = input.received ? Date.now() : null;
        await rawQuery(
          `UPDATE bowlers SET tshirtsReceived = ?, tshirtsReceivedAt = ? WHERE id = ?`,
          [input.received ? 1 : 0, now, input.bowlerId]
        );
        // Fire-and-forget: color the captain's First Name cell purple in the sheet
        const tshirtSheetTarget = b.eventId ? await getEventSheetTarget(b.eventId) : undefined;
        markTshirtReceivedInSheet({
          firstName: b.legalFirstName,
          lastName: b.legalLastName,
          laneNumber: b.laneNumber,
          received: input.received,
          target: tshirtSheetTarget,
        }).then(() => b.eventId ? recordSheetSync(b.eventId) : undefined)
          .catch((err) => console.error("[tshirts] sheet color write-back failed:", err));
        return { ok: true, received: input.received, receivedAt: now };
      }),
    // Read current status for a bowler (captain).
    status: publicProcedure
      .input(z.object({ bowlerId: z.number() }))
      .query(async ({ input }) => {
        const rows = await rawQuery<{ tshirtsReceived: number | null; tshirtsReceivedAt: number | null }>(
          `SELECT tshirtsReceived, tshirtsReceivedAt FROM bowlers WHERE id = ? LIMIT 1`,
          [input.bowlerId]
        );
        return {
          received: Boolean(rows[0]?.tshirtsReceived),
          receivedAt: rows[0]?.tshirtsReceivedAt ?? null,
        };
      }),
  }),

  // ─── ADVERTISEMENTS (sponsor tiers, weighted rotation) ────────────────────
  ads: router({
    // ED: list all ads for an event (any status)
    list: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return rawQuery(
          `SELECT id, eventId, sponsorName, tier, category, mediaType, mediaUrl, mediaKey,
                  linkUrl, runUntil, enabled, createdAt, updatedAt
           FROM advertisements WHERE eventId = ? ORDER BY
             FIELD(tier,'gold','silver','bronze'), createdAt DESC`,
          [input.eventId]
        );
      }),
    // Public: active ads for portals (enabled + not past runUntil)
    listActive: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const now = Date.now();
        return rawQuery(
          `SELECT id, sponsorName, tier, category, mediaType, mediaUrl, linkUrl
           FROM advertisements
           WHERE eventId = ? AND enabled = 1 AND (runUntil IS NULL OR runUntil >= ?)
           ORDER BY FIELD(tier,'gold','silver','bronze')`,
          [input.eventId, now]
        );
      }),
    // ED: upload media (base64) -> S3, returns url+key
    uploadMedia: publicProcedure
      .input(z.object({
        eventId: z.number(),
        fileName: z.string(),
        contentType: z.string(),
        dataBase64: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.dataBase64, "base64");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { key, url } = await storagePut(
          `event-${input.eventId}-ads/${safeName}`,
          buffer,
          input.contentType
        );
        return { key, url };
      }),
    // ED: create an ad
    create: publicProcedure
      .input(z.object({
        eventId: z.number(),
        sponsorName: z.string().min(1),
        tier: z.enum(["bronze", "silver", "gold"]),
        category: z.enum(["bowling", "travel", "concerts", "restaurant"]),
        mediaType: z.enum(["image", "video"]),
        mediaUrl: z.string().min(1),
        mediaKey: z.string().optional(),
        linkUrl: z.string().optional(),
        runUntil: z.number().nullable().optional(),
        enabled: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const now = Date.now();
        await rawQuery(
          `INSERT INTO advertisements
             (eventId, sponsorName, tier, category, mediaType, mediaUrl, mediaKey, linkUrl, runUntil, enabled, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [input.eventId, input.sponsorName, input.tier, input.category, input.mediaType,
           input.mediaUrl, input.mediaKey ?? null, input.linkUrl ?? null,
           input.runUntil ?? null, input.enabled ? 1 : 0, now, now]
        );
        return { ok: true };
      }),
    // ED: update an ad
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        sponsorName: z.string().optional(),
        tier: z.enum(["bronze", "silver", "gold"]).optional(),
        category: z.enum(["bowling", "travel", "concerts", "restaurant"]).optional(),
        linkUrl: z.string().nullable().optional(),
        runUntil: z.number().nullable().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const sets: string[] = [];
        const vals: unknown[] = [];
        if (input.sponsorName !== undefined) { sets.push("sponsorName = ?"); vals.push(input.sponsorName); }
        if (input.tier !== undefined) { sets.push("tier = ?"); vals.push(input.tier); }
        if (input.category !== undefined) { sets.push("category = ?"); vals.push(input.category); }
        if (input.linkUrl !== undefined) { sets.push("linkUrl = ?"); vals.push(input.linkUrl); }
        if (input.runUntil !== undefined) { sets.push("runUntil = ?"); vals.push(input.runUntil); }
        if (input.enabled !== undefined) { sets.push("enabled = ?"); vals.push(input.enabled ? 1 : 0); }
        if (sets.length === 0) return { ok: true };
        sets.push("updatedAt = ?"); vals.push(Date.now());
        vals.push(input.id);
        await rawQuery(`UPDATE advertisements SET ${sets.join(", ")} WHERE id = ?`, vals);
        return { ok: true };
      }),
    // ED: delete an ad
    remove: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await rawQuery(`DELETE FROM advertisements WHERE id = ?`, [input.id]);
        return { ok: true };
      }),
  }),

  // ─── RE-ENTRY (doorman-issued, bracelet-secured) ──────────────────────────
  reentry: router({
    // Doorman enters a bracelet number; system mints a single-use re-entry token
    // bound to that bracelet and returns a QR for the patron to photograph.
    issue: publicProcedure
      .input(z.object({
        eventId: z.number(),
        doormanId: z.number().optional(),
        braceletNumber: z.string().min(1),
        bowlerId: z.number().optional(),
        guestId: z.string().optional(),
        passportType: z.enum(["pool", "banquet"]).default("pool"),
      }))
      .mutation(async ({ input }) => {
        const tokenValue = "RE-" + crypto.randomBytes(20).toString("hex");
        await rawQuery(
          `INSERT INTO reentry_tokens (eventId, bowlerId, guestId, passportType, token, braceletNumber, issuedByDoormanId, issuedAt, used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [input.eventId, input.bowlerId ?? null, input.guestId ?? null, input.passportType, tokenValue, input.braceletNumber, input.doormanId ?? null, Date.now()]
        );
        const qr = await QRCode.toDataURL(tokenValue, { width: 280, margin: 2 });
        await writeAuditLog({
          eventId: input.eventId,
          actorRole: "Doorman",
          actorId: input.doormanId ?? undefined,
          action: "reentry_issued",
          targetId: input.bowlerId,
          targetType: input.guestId ? "guest" : "bowler",
          details: `Bracelet #${input.braceletNumber} (${input.passportType})`,
        });
        return { success: true, token: tokenValue, qr, braceletNumber: input.braceletNumber };
      }),

    // Doorman scans the patron's re-entry QR. We surface the bracelet number that
    // was captured at issuance so the doorman can match it to the physical band,
    // then consume the single-use token.
    verify: publicProcedure
      .input(z.object({
        token: z.string(),
        doormanId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const rows = await rawQuery(
          `SELECT id, eventId, bowlerId, guestId, passportType, braceletNumber, used FROM reentry_tokens WHERE token=?`,
          [input.token]
        ) as Record<string, unknown>[];
        const rec = rows[0];
        if (!rec) return { success: false, error: "Invalid re-entry code" } as const;
        if (rec.used) return { success: false, error: "This re-entry code was already used", braceletNumber: rec.braceletNumber as string } as const;
        await rawQuery(
          `UPDATE reentry_tokens SET used=1, usedAt=?, scannedByDoormanId=? WHERE id=?`,
          [Date.now(), input.doormanId ?? null, rec.id]
        );
        let patronName: string | null = null;
        if (rec.bowlerId) {
          const b = await getBowlerById(rec.bowlerId as number) as Record<string, unknown> | null;
          if (b) patronName = `${b.legalFirstName ?? ""} ${b.legalLastName ?? ""}`.trim();
        }
        await writeAuditLog({
          eventId: rec.eventId as number,
          actorRole: "Doorman",
          actorId: input.doormanId ?? undefined,
          action: "reentry_verified",
          targetId: rec.bowlerId as number | undefined,
          targetType: rec.guestId ? "guest" : "bowler",
          details: `Bracelet #${rec.braceletNumber} (${rec.passportType})`,
        });
        return {
          success: true,
          braceletNumber: rec.braceletNumber as string,
          passportType: rec.passportType as string,
          guestId: (rec.guestId as string) ?? null,
          patronName,
        } as const;
      }),

    // History of re-entry tokens for an event (ED oversight)
    listForEvent: publicProcedure
      .input(z.object({ eventId: z.number(), limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return rawQuery(
          `SELECT id, bowlerId, guestId, passportType, braceletNumber, used, issuedAt, usedAt
           FROM reentry_tokens WHERE eventId=? ORDER BY issuedAt DESC LIMIT ?`,
          [input.eventId, input.limit]
        );
      }),
  }),

  // ─── POST-EVENT SURVEY ────────────────────────────────────────────────────
  survey: router({
    // Bowler-facing: is the survey available, and has this bowler already submitted?
    status: publicProcedure
      .input(z.object({ eventId: z.number(), bowlerId: z.number() }))
      .query(async ({ input }) => {
        const ev = await rawQuery(
          `SELECT surveyEnabled, surveyOpen, poolPartyEnabled FROM events WHERE id=?`,
          [input.eventId]
        ) as Record<string, unknown>[];
        const enabled = Boolean(ev[0]?.surveyEnabled);
        const open = Boolean(ev[0]?.surveyOpen);
        const poolPartyEnabled = Boolean(ev[0]?.poolPartyEnabled);
        const existing = await rawQuery(
          `SELECT id FROM survey_responses WHERE eventId=? AND bowlerId=? LIMIT 1`,
          [input.eventId, input.bowlerId]
        ) as Record<string, unknown>[];
        return {
          available: enabled && open,
          enabled,
          open,
          poolPartyEnabled,
          alreadySubmitted: existing.length > 0,
        };
      }),

    // Bowler submits the survey (one per bowler per event).
    submit: publicProcedure
      .input(z.object({
        eventId: z.number(),
        bowlerId: z.number(),
        q1Rating: z.number().min(1).max(5).optional().nullable(),
        q1Comment: z.string().optional().nullable(),
        q2Rating: z.number().min(1).max(5).optional().nullable(),
        q2Comment: z.string().optional().nullable(),
        q3Rating: z.number().min(1).max(5).optional().nullable(),
        q3Comment: z.string().optional().nullable(),
        q4Rating: z.number().min(1).max(5).optional().nullable(),
        q4Comment: z.string().optional().nullable(),
        q5Rating: z.number().min(1).max(5).optional().nullable(),
        q5Comment: z.string().optional().nullable(),
        q6Rating: z.number().min(1).max(5).optional().nullable(),
        q6Comment: z.string().optional().nullable(),
        q7Rating: z.number().min(1).max(5).optional().nullable(),
        q7Comment: z.string().optional().nullable(),
        q8Comment: z.string().optional().nullable(),
        q9Rating: z.number().min(1).max(5).optional().nullable(),
        q9Comment: z.string().optional().nullable(),
        q10Rating: z.number().min(1).max(5).optional().nullable(),
        q10Comment: z.string().optional().nullable(),
        attendNextYear: z.string().optional().nullable(),
        attendNextYearComment: z.string().optional().nullable(),
        testimonialPermission: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const existing = await rawQuery(
          `SELECT id FROM survey_responses WHERE eventId=? AND bowlerId=? LIMIT 1`,
          [input.eventId, input.bowlerId]
        ) as Record<string, unknown>[];
        if (existing.length > 0) {
          return { success: false, error: "You have already submitted your survey. Thank you!" } as const;
        }
        // Get bowler name and lane for Google Sheets write-back
        const bowlerData = await rawQuery(
          `SELECT firstName, lastName, laneNumber FROM app_users WHERE id=?`,
          [input.bowlerId]
        ) as Array<{ firstName: string; lastName: string; laneNumber: number | null }>;
        const bowler = bowlerData[0];
        await rawQuery(
          `INSERT INTO survey_responses
             (eventId, bowlerId, submittedAt,
              q1Rating, q1Comment, q2Rating, q2Comment, q3Rating, q3Comment,
              q4Rating, q4Comment, q5Rating, q5Comment, q6Rating, q6Comment,
              q7Rating, q7Comment, q8Comment,
              q9Rating, q9Comment, q10Rating, q10Comment,
              attendNextYear, attendNextYearComment, testimonialPermission)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.eventId, input.bowlerId, Date.now(),
            input.q1Rating ?? null, input.q1Comment ?? null,
            input.q2Rating ?? null, input.q2Comment ?? null,
            input.q3Rating ?? null, input.q3Comment ?? null,
            input.q4Rating ?? null, input.q4Comment ?? null,
            input.q5Rating ?? null, input.q5Comment ?? null,
            input.q6Rating ?? null, input.q6Comment ?? null,
            input.q7Rating ?? null, input.q7Comment ?? null,
            input.q8Comment ?? null,
            input.q9Rating ?? null, input.q9Comment ?? null,
            input.q10Rating ?? null, input.q10Comment ?? null,
            input.attendNextYear ?? null, input.attendNextYearComment ?? null,
            input.testimonialPermission ? 1 : 0,
          ]
        );
        // Write survey ratings to Google Sheet (fire-and-forget)
        if (bowler) {
          import('./googleSheets').then(({ writeSurveyToSheet }) =>
            writeSurveyToSheet({
              firstName: bowler.firstName,
              lastName: bowler.lastName,
              laneNumber: bowler.laneNumber,
              q1Rating: input.q1Rating,
              q2Rating: input.q2Rating,
              q3Rating: input.q3Rating,
              q4Rating: input.q4Rating,
              q5Rating: input.q5Rating,
              q6Rating: input.q6Rating,
              q7Rating: input.q7Rating,
              q8Comment: input.q8Comment,
              q9Rating: input.q9Rating,
              q10Rating: input.q10Rating,
            }).then(() => recordSheetSync(input.eventId))
          ).catch(() => {});
        }
        // Notify the ED when negative feedback (any rating <= 2) arrives so they can act fast.
        const ratings = [input.q1Rating, input.q2Rating, input.q3Rating, input.q4Rating, input.q5Rating, input.q6Rating, input.q7Rating].filter((r): r is number => typeof r === "number");
        const low = ratings.filter((r) => r <= 2);
        if (low.length > 0) {
          import('./notifyED').then(({ notifyED }) =>
            notifyED({
              title: "New survey: needs attention",
              content: `A bowler left ${low.length} low rating(s). Review the Survey tab for details.`,
              category: 'survey' as const,
            })
          ).catch(() => {});
        }
        return { success: true } as const;
      }),

    // ED: aggregate results (averages per question + raw responses).
    results: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const rows = await rawQuery(
          `SELECT * FROM survey_responses WHERE eventId=? ORDER BY submittedAt DESC`,
          [input.eventId]
        ) as Record<string, unknown>[];
        const avg = (key: string) => {
          const vals = rows.map((r) => r[key] as number | null).filter((v): v is number => typeof v === "number");
          if (vals.length === 0) return null;
          return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        };
        return {
          count: rows.length,
          averages: {
            q1: avg("q1Rating"), q2: avg("q2Rating"), q3: avg("q3Rating"),
            q4: avg("q4Rating"), q5: avg("q5Rating"), q6: avg("q6Rating"), q7: avg("q7Rating"),
          },
          responses: rows,
        };
      }),

    // ED: testimonials (only responses where the bowler granted permission).
    testimonials: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return rawQuery(
          `SELECT sr.id, sr.q1Rating, sr.q1Comment, sr.q7Rating, sr.q7Comment, sr.submittedAt,
                  b.legalFirstName, b.legalLastName, b.centerName
           FROM survey_responses sr
           LEFT JOIN bowlers b ON b.id = sr.bowlerId
           WHERE sr.eventId=? AND sr.testimonialPermission=1
           ORDER BY sr.submittedAt DESC`,
          [input.eventId]
        );
      }),
  }),

  // ─── AUDIT LOG ────────────────────────────────────────────────────────────
  audit: router({
    list: publicProcedure
      .input(z.object({ eventId: z.number().optional(), limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return getAuditLog(input.eventId, input.limit);
      }),
  }),

  // ─── IMPORT ───────────────────────────────────────────────────────────────
  import: router({
    process: publicProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.unknown())),
        sourceType: z.enum(["csv", "paste", "google_sheets"]),
        sourceName: z.string().optional(),
        eventId: z.number(),
        leagueCode: z.string().default("1"),
        eventCode: z.string().default("01"),
        importedBy: z.number().optional(),
        sheetSpreadsheetId: z.string().optional().nullable(),
        sheetTabName: z.string().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        // Auto-save the Google Sheet target for this event whenever the ED imports from a Google Sheet.
        // This ensures all subsequent write-backs (IDs, QR codes, contact info) go to the correct sheet,
        // regardless of which sheet was used previously. No hardcoded sheet IDs anywhere.
        if (input.sourceType === "google_sheets" && input.sheetSpreadsheetId) {
          await updateEventSheetTarget(input.eventId, input.sheetSpreadsheetId, input.sheetTabName ?? null);
        }
        const sessionId = await createImportSession({
          eventId: input.eventId,
          importedBy: input.importedBy,
          sourceType: input.sourceType,
          sourceName: input.sourceName,
        });

        let imported = 0, updated = 0, skipped = 0, errors = 0;
        const errorDetails: unknown[] = [];
        const generatedIds: string[] = [];

        // Use the sheet provided in THIS import request, not the stored default
        // This allows importing from different sheets without being locked to the previous one
        // Build a SheetTarget using the correct property names (spreadsheetId/sheetName)
        let eventSheetTarget: import('./googleSheets').SheetTarget = { spreadsheetId: input.sheetSpreadsheetId, sheetName: input.sheetTabName };
        if (!eventSheetTarget.spreadsheetId) {
          // Only fall back to stored target if no sheet was provided in this request
          const stored = await getEventSheetTarget(input.eventId);
          eventSheetTarget = { spreadsheetId: stored.spreadsheetId, sheetName: stored.sheetName };
        }

        // Get all centers for lookup
        const centers = await getAllCenters() as Record<string, unknown>[];
        const centerMap = new Map<string, Record<string, unknown>>(centers.map(c => [
          (c.centerName as string).toLowerCase(), c
        ]));

        // Group rows by center+team to assign BB positions
        const teamPositionMap = new Map<string, number>();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars

        for (const row of input.rows) {
          try {
            let centerName = String(row["centerName"] ?? row["Center"] ?? row["center"] ?? "").trim();
            // Normalize known spreadsheet center-name variants to seeded DB names
            const CENTER_NAME_ALIASES: Record<string, string> = {
              "bowlero river grove sat": "Bowlero River Grove (Saturday)",
              "bowlero river grove saturday": "Bowlero River Grove (Saturday)",
            };
            const aliased = CENTER_NAME_ALIASES[centerName.toLowerCase()];
            if (aliased) centerName = aliased;
            const teamCode = String(row["Team #"] ?? row["team"] ?? row["Team"] ?? "").trim().padStart(2, "0");
            const firstName = String(row["First Name"] ?? row["first_name"] ?? row["FirstName"] ?? "").trim();
            const lastName = String(row["Last Name"] ?? row["last_name"] ?? row["LastName"] ?? "").trim();
            const teamName = String(row["Team Name"] ?? row["team_name"] ?? "").trim();
            const captRaw = String(row["Capt"] ?? row["Captain"] ?? row["Is Captain"] ?? row["capt"] ?? row["captain"] ?? "").trim().toLowerCase();
            const isCapt = ["y", "yes", "true", "1", "x"].includes(captRaw);

            if (!firstName || !lastName) { skipped++; continue; }
            // Skip placeholder/vacant rows
            const firstLower = firstName.toLowerCase();
            if (firstLower === 'vacant' || firstLower === 'tbd' || firstLower === 'open' || firstLower.startsWith('vacant') || firstLower.startsWith('tbd')) { skipped++; continue; }

            // Find center — exact match first, then fuzzy partial match
            let center = centerMap.get(centerName.toLowerCase()) as Record<string, unknown> | undefined;
            if (!center && centerName) {
              // Try partial/fuzzy match: check if any DB center name contains the input or vice versa
              const lowerInput = centerName.toLowerCase();
              const entries = Array.from(centerMap.entries());
              for (let ei = 0; ei < entries.length; ei++) {
                const [key, val] = entries[ei];
                if (key.includes(lowerInput) || lowerInput.includes(key)) {
                  center = val as Record<string, unknown>;
                  break;
                }
              }
            }
            if (!center) {
              errors++;
              const availableCenters = Array.from(centerMap.keys()).join(", ");
              errorDetails.push({ 
                row: firstName + " " + lastName, 
                error: `Center not found: "${centerName}" (key: "${centerName.toLowerCase()}"). Available: [${availableCenters}]` 
              });
              continue;
            }

            const cc = String(center.centerCode);
            const teamKey = `${cc}-${teamCode}`;
            const currentPos = (teamPositionMap.get(teamKey) ?? 0) + 1;
            teamPositionMap.set(teamKey, currentPos);
            const bb = String(currentPos).padStart(2, "0");

            // Generate scantron ID
            let scantronId: string;
            try {
              scantronId = generateScantronId(cc, input.leagueCode, input.eventCode, teamCode, bb);
            } catch {
              errors++;
              errorDetails.push({ row: firstName + " " + lastName, error: "ID generation failed" });
              continue;
            }

            // Check for existing team or create
            let teamRows = await rawQuery(
              "SELECT id FROM teams WHERE teamCode = ? AND centerId = ? AND eventId = ? LIMIT 1",
              [teamCode, center.id, input.eventId]
            ) as Record<string, unknown>[];
            let teamId: number;
            if (teamRows.length === 0) {
              await rawQuery(
                "INSERT INTO teams (leagueId, centerId, eventId, teamCode, teamName, status) VALUES (1, ?, ?, ?, ?, 'gray')",
                [center.id, input.eventId, teamCode, teamName || `Team ${teamCode}`]
              );
              teamRows = await rawQuery(
                "SELECT id FROM teams WHERE teamCode = ? AND centerId = ? AND eventId = ? LIMIT 1",
                [teamCode, center.id, input.eventId]
              ) as Record<string, unknown>[];
            }
            teamId = teamRows[0]?.id as number;

            // Check duplicate — scoped to this event so same bowler in a different event creates a new record
            const existing = await rawQuery(
              "SELECT id FROM bowlers WHERE scantronId = ? AND eventId = ? LIMIT 1",
              [scantronId, input.eventId]
            ) as Record<string, unknown>[];

            // ── Hotel / room data ─────────────────────────────────────────────────────
            // Col M: Hotel Confirmation # (confirmation code from hotel)
            const hotelConfirmation = String(
              row["Hotel Confirmation #"] ?? row["Hotel Confirmation"] ?? row["Confirmation #"] ??
              row["Confirmation"] ?? row["Conf #"] ?? row["Conf"] ?? row["Confirmation Number"] ??
              row["Confirmation Code"] ?? row["Confirmation No"] ?? row["Confirmation No."] ??
              row["hotel_confirmation"] ?? row["hotelConfirmation"] ?? row["confirmation_code"] ?? ""
            ).trim();
            // Col N / O: Check-in / Check-out dates
            const BLANK_DATE = new Set(['-', '--', 'n/a', 'na', 'none', 'tbd', '']);
            const rawCheckin = String(row["Check In"] ?? row["Check-In Date"] ?? row["checkin_date"] ?? "").trim();
            const rawCheckout = String(row["Check Out"] ?? row["Check-Out Date"] ?? row["checkout_date"] ?? "").trim();
            const checkinDate = BLANK_DATE.has(rawCheckin.toLowerCase()) ? '' : rawCheckin;
            const checkoutDate = BLANK_DATE.has(rawCheckout.toLowerCase()) ? '' : rawCheckout;
            // Room Type — legacy fallback only (removed from current sheet)
            const roomType = String(row["Room Type"] ?? row["room_type"] ?? "").trim();
            const roommateFirst = String(row["Roommate First Name"] ?? row["Roommate First"] ?? row["roommate_first"] ?? "").trim();
            const roommateLast = String(row["Roommate Last Name"] ?? row["Roommate Last"] ?? row["roommate_last"] ?? "").trim();
            const roommateRequested = !!(roommateFirst || roommateLast);
            const roomAmount = parseFloat(String(row["Amount Due"] ?? row["Room Amount Due"] ?? row["Room Amount"] ?? row["room_amount"] ?? "0").replace(/[$,]/g, "")) || 0;

            // ── Banquet table assignment (Col W) ──────────────────────────────────────
            // Accepts: "Assigned Table #", "Assigned Table", "Table #", "Table", "banquet_table", "Banquet Table"
            const banquetTable = String(
              row["Assigned Table #"] ?? row["Assigned Table"] ?? row["Table #"] ??
              row["Table"] ?? row["banquet_table"] ?? row["Banquet Table"] ?? ""
            ).trim() || null;

            // ── Extra banquet tickets (Col S / X) ────────────────────────────────────
            // Accepts numeric count, dollar amount, or Y/N
            const banquetRaw = String(
              row["Extra Banquet"] ?? row["extra banquet"] ?? row["Banquet $80"] ??
              row["Banquet"] ?? row["banquet"] ?? row["extra_banquet"] ?? "0"
            ).trim();
            const extraBanquet = ["y", "yes", "true", "x"].includes(banquetRaw.toLowerCase())
              ? 1
              : (parseFloat(banquetRaw.replace(/[$,]/g, "")) || 0);

            // ── Pool party / extra guest fee (Col Q / R / U / Y) ─────────────────────
            // Col Q: main pool party flag (Y/N)
            // Col R: extra guest tickets (numeric, dollar, or Y/N)
            // Col U: extra pool party $ amount (dollar amount)
            // Parser merges all into: poolParty (boolean) + guestPoolPartyAmount (number)
            //
            // Accepted values for pool party flag: Y, Yes, True, 1, X, any number > 0,
            //   any dollar amount > 0, "Pool Party check in...", time strings (7pm, 7:00 PM)
            const poolPartyFlagRaw = String(
              row["Pool Party"] ?? row["pool_party"] ?? row["pool party"] ?? ""
            ).trim();
            const extraPoolPartyRaw = String(
              row["Extra Pool Party"] ?? row["extra pool party"] ?? row["Guest Pool Party"] ??
              row["Guest $15"] ?? row["extra_pool_party"] ?? ""
            ).trim();
            const extraPoolPartyDollarRaw = String(
              row["Extra Pool Party $"] ?? row["Extra Pool Party $"] ?? row["pool_party_amount"] ?? ""
            ).trim();

            // Resolve pool party attendance: true if flag is Y/yes/true/1/x, or any positive numeric/dollar value
            const isYesLike = (v: string) =>
              ["y", "yes", "true", "1", "x"].includes(v.toLowerCase()) ||
              /\d/.test(v) && parseFloat(v.replace(/[$,]/g, "")) > 0 ||
              /pool party/i.test(v) ||
              /\d+(am|pm|:\d{2})/i.test(v);

            const poolParty = isYesLike(poolPartyFlagRaw) || isYesLike(extraPoolPartyRaw) || isYesLike(extraPoolPartyDollarRaw);

            // Resolve guest count / dollar amount for extra pool party guests
            const resolveGuestAmount = (v: string): number => {
              const lower = v.toLowerCase();
              if (["y", "yes", "true", "x"].includes(lower)) return 0; // attending but no extra guests
              return parseFloat(v.replace(/[$,]/g, "")) || 0;
            };
            const guestPoolPartyAmount =
              resolveGuestAmount(extraPoolPartyDollarRaw) ||
              resolveGuestAmount(extraPoolPartyRaw) ||
              0;
            const extraGuestFee = guestPoolPartyAmount;
            const totalAmountDue = parseFloat(String(row["Total Due"] ?? row["Total Amount"] ?? row["total"] ?? "0").replace(/[$,]/g, "")) || 0;
            const notes = String(row["Special Notes"] ?? row["notes"] ?? "").trim();
            // Phone and Email are present but typically empty — accept gracefully
            const phone = String(row["Phone"] ?? row["phone"] ?? "").trim();
            const email = String(row["Email"] ?? row["email"] ?? "").trim();

            // Bowling stats fields
            const sanctionNumber = String(row["Sanction #"] ?? row["sanction_number"] ?? row["Sanction"] ?? "").trim() || null;
            const gamesRaw = String(row["# Games"] ?? row["Games"] ?? row["games"] ?? "").trim();
            const gamesPlayed = gamesRaw ? (parseInt(gamesRaw) || null) : null;
            const avgRaw = String(row["Best Avg"] ?? row["High Avg"] ?? row["Average"] ?? row["avg"] ?? "").trim();
            const bestAverage = avgRaw ? (parseInt(avgRaw) || null) : null;
            const tshirtSize = String(row["T-Shirt Size"] ?? row["Shirt Size"] ?? row["shirt"] ?? "").trim().toUpperCase() || null;
            const under21Raw = String(row["Under 21?"] ?? row["Under 21"] ?? row["under21"] ?? "").trim().toUpperCase();
            const under21 = ["Y", "YES", "TRUE", "1"].includes(under21Raw);
            const leagueMemberRaw = String(row["League Member"] ?? row["league_member"] ?? "").trim().toUpperCase();
            const leagueMember = ["Y", "YES", "TRUE", "1"].includes(leagueMemberRaw);
            const squadTimeVal = String(row["Squad Day & Time"] ?? row["Squad Time"] ?? row["squad_time"] ?? row["Squad"] ?? "").trim() || null;
            const laneRaw = String(row["Lane #"] ?? row["Lane"] ?? row["lane"] ?? "").trim();
            const laneNumber = laneRaw ? (parseInt(laneRaw) || null) : null;
            // Column 44 — "Lane to Event" / "Lane to Banquet" directional info
            const laneToEvent = String(row["Lane to Event"] ?? row["Lane to Banquet"] ?? row["lane_to_event"] ?? row["LaneToEvent"] ?? "").trim() || null;

            if (existing.length > 0) {
              // Update existing
              const bowlerId = existing[0].id as number;
              await updateBowler(bowlerId, {
                legalFirstName: firstName, legalLastName: lastName,
                teamId, centerId: center.id as number, isCapitain: isCapt,
                notes: notes || null,
                phone: phone || null, email: email || null,
                sanctionNumber, gamesPlayed, bestAverage, tshirtSize,
                under21, leagueMember, squadTime: squadTimeVal, laneNumber, laneToEvent,
                guestPoolPartyAmount: guestPoolPartyAmount.toFixed(2),
                banquetTable: banquetTable || null,
              });
              if (checkinDate || checkoutDate || roomType || hotelConfirmation) {
                await upsertHotelRecord(bowlerId, { checkinDate: checkinDate || null, checkoutDate: checkoutDate || null, roomType: roomType || null, roommateRequested, roommateFirstName: roommateFirst || null, roommateLastName: roommateLast || null, roomAmount, confirmationCode: hotelConfirmation || null });
              }
              const effectiveBanquet = extraBanquet;
              const effectivePoolParty = poolParty;
              const effectiveExtraGuest = extraGuestFee;
              if (effectiveBanquet || totalAmountDue || effectivePoolParty || effectiveExtraGuest) {
                await upsertPaymentRecord(bowlerId, { roomAmount, banquetAmount: effectiveBanquet, poolParty: effectivePoolParty, extraGuestFee: effectiveExtraGuest, totalAmountDue });
              }
              updated++;
            } else {
              // Insert new bowler
              await rawQuery(
                `INSERT INTO bowlers (eventId, leagueId, teamId, centerId, scantronId, bowlerPosition, legalFirstName, legalLastName, isCapitain, phone, email, notes, registrationStatus,
                   sanctionNumber, gamesPlayed, bestAverage, tshirtSize, under21, leagueMember, squadTime, laneNumber, laneToEvent, guestPoolPartyAmount, banquetTable)
                 VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pre_registered', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [input.eventId, teamId, center.id, scantronId, bb, firstName, lastName, isCapt ? 1 : 0,
                 phone || null, email || null, notes || null,
                 sanctionNumber || null, gamesPlayed ?? null, bestAverage ?? null, tshirtSize || null,
                 under21 ? 1 : 0, leagueMember ? 1 : 0, squadTimeVal || null, laneNumber ?? null, laneToEvent || null,
                 guestPoolPartyAmount.toFixed(2), banquetTable || null]
              );
              const newBowler = await rawQuery("SELECT id FROM bowlers WHERE scantronId = ? LIMIT 1", [scantronId]) as Record<string, unknown>[];
              const bowlerId = newBowler[0]?.id as number;
              if (bowlerId) {
                if (checkinDate || checkoutDate || roomType || hotelConfirmation) {
                  await upsertHotelRecord(bowlerId, { checkinDate: checkinDate || null, checkoutDate: checkoutDate || null, roomType: roomType || null, roommateRequested, roommateFirstName: roommateFirst || null, roommateLastName: roommateLast || null, roomAmount, confirmationCode: hotelConfirmation || null });
                }
                const effectiveBanquet2 = extraBanquet;
                const effectivePoolParty2 = poolParty;
                const effectiveExtraGuest2 = extraGuestFee;
                if (effectiveBanquet2 || totalAmountDue || effectivePoolParty2 || effectiveExtraGuest2) {
                  await upsertPaymentRecord(bowlerId, { roomAmount, banquetAmount: effectiveBanquet2, poolParty: effectivePoolParty2, extraGuestFee: effectiveExtraGuest2, totalAmountDue });
                }

                // ── Generate ALL passport QR tokens at import time ────────────────────
                // This secures the system: tokens exist even if sign-up fails later.
                const importPoolToken  = uuidv4().replace(/-/g, "");
                const importBanquetToken = uuidv4().replace(/-/g, "");
                await rawQuery(
                  `UPDATE bowlers SET poolPartyToken = ?, banquetToken = ? WHERE id = ?`,
                  [importPoolToken, importBanquetToken, bowlerId]
                );

                // Guest tokens: guest ID = scantronId + suffix letter (A, B, C…)
                // Pool: one guest per $15 in guestPoolPartyAmount.
                // Banquet: one guest per $80 in extraBanquet (dollar amount).
                // A single guest gets BOTH a pool and a banquet pass if both were paid;
                // the number of guest rows = max(poolGuests, banquetGuests).
                const SUFFIXES = ["A","B","C","D","E","F","G","H"];
                const poolGuestCount = Math.floor(guestPoolPartyAmount / 15);
                const banquetGuestCount = extraBanquet >= 1 && extraBanquet < 80
                  ? Math.round(extraBanquet) // Y/N or small integer count
                  : Math.floor(extraBanquet / 80);
                const totalGuestCount = Math.min(Math.max(poolGuestCount, banquetGuestCount), SUFFIXES.length);
                const importGuestTokens: Array<{ suffix: string; token: string }> = [];
                if (totalGuestCount > 0) {
                  await rawQuery(`DELETE FROM guest_pool_party_tokens WHERE bowlerId = ?`, [bowlerId]);
                  for (let gi = 0; gi < totalGuestCount; gi++) {
                    const suffix = SUFFIXES[gi];
                    const guestId = `${scantronId}${suffix}`;
                    // pool token for this guest (only if they have a pool pass)
                    const poolTok = gi < poolGuestCount ? guestId : null;
                    // banquet token for this guest (only if they have a banquet pass)
                    const banquetTok = gi < banquetGuestCount ? `${guestId}-BQ` : null;
                    // `token` column is NOT NULL + unique; use pool token, else banquet token, else guestId
                    const primaryToken = poolTok ?? banquetTok ?? guestId;
                    await rawQuery(
                      `INSERT INTO guest_pool_party_tokens (bowlerId, eventId, guestId, suffix, token, banquetToken) VALUES (?, ?, ?, ?, ?, ?)`,
                      [bowlerId, input.eventId, guestId, suffix, primaryToken, banquetTok]
                    );
                    if (poolTok) importGuestTokens.push({ suffix, token: poolTok });
                  }
                }

                // Fire-and-forget: write Bowler ID + all QR URLs to the Google Sheet
                Promise.resolve().then(async () => {
                  try {
                    await writeBowlerIdToSheet({ firstName, lastName, laneNumber: laneNumber ?? null, scantronId, target: eventSheetTarget });
                    await writeQRCodesToSheet({
                      firstName,
                      lastName,
                      laneNumber: laneNumber ?? null,
                      banquetToken: importBanquetToken,
                      poolPartyToken: importPoolToken,
                      guestPoolTokens: importGuestTokens,
                      appOrigin: APP_ORIGIN,
                      target: eventSheetTarget,
                    });
                    await recordSheetSync(input.eventId);
                  } catch (e) {
                    console.warn("[import] sheet write-back failed:", e);
                  }
                });
              }
              generatedIds.push(scantronId);
              imported++;
            }
          } catch (err) {
            errors++;
            errorDetails.push({ error: String(err) });
          }
        }

        await updateImportSession(sessionId, {
          totalRows: input.rows.length,
          importedRows: imported,
          updatedRows: updated,
          skippedRows: skipped,
          errorRows: errors,
          status: "completed",
          errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
        });

        await writeAuditLog({
          eventId: input.eventId,
          actorRole: "EventDirector",
          actorId: input.importedBy,
          action: "bulk_import",
          details: `Imported ${imported}, updated ${updated}, skipped ${skipped}, errors ${errors} from ${input.sourceName ?? input.sourceType}`,
        });

        return { success: true, imported, updated, skipped, errors, errorDetails, generatedIds, sessionId };
      }),

    history: publicProcedure
      .input(z.object({ eventId: z.number().optional() }))
      .query(async ({ input }) => {
        return getImportHistory(input.eventId);
      }),

    // Fetch data from a Google Sheets URL
    fetchGoogleSheet: publicProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ input }) => {
        // Extract sheet ID from URL
        const match = input.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('Invalid Google Sheets URL');
        const sheetId = match[1];
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        const resp = await fetch(csvUrl);
        if (!resp.ok) throw new Error('Could not fetch sheet — make sure it is shared publicly');
        const text = await resp.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('Sheet appears empty');
        const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map((line: string) => {
          const vals = line.split(',').map((v: string) => v.trim().replace(/"/g, ''));
          const row: Record<string, unknown> = {};
          headers.forEach((h: string, i: number) => { row[h] = vals[i] ?? ''; });
          return row;
        }).filter((r: Record<string, unknown>) => Object.values(r).some((v) => v !== ''));
        return { headers, rows };
      }),
  }),

  // ─── HOTEL + PAYMENT ──────────────────────────────────────────────────────
  hotel: router({
    upsert: publicProcedure
      .input(z.object({ bowlerId: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(async ({ input }) => {
        await upsertHotelRecord(input.bowlerId, input.data);
        return { success: true };
      }),
  }),

  payment: router({
    upsert: publicProcedure
      .input(z.object({ bowlerId: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(async ({ input }) => {
        await upsertPaymentRecord(input.bowlerId, input.data);
        return { success: true };
      }),
  }),

  // ─── BOWLER / CAPTAIN AUTH ─────────────────────────────────────────────────
  bowlerAuth: bowlerAuthRouter,

  // ─── OFFLINE DOOR SCANNER (single-laptop, banquet + pool) ──────────────────
  offlineDoor: offlineDoorRouter,

  claimCodes: claimCodesRouter,

  adInquiry: adInquiryRouter,

  // ─── OFFLINE PACKAGE (RETIRED) ────────────────────────────────────────────────────────────────────────
  // NOTE: This legacy "Venue Offline Package (Windows)" router has been fully retired and replaced by the
  // single-laptop, fully-offline `offlineDoor` router + the /offline-door page. Both endpoints below now
  // refuse to run so they can never accidentally write to the canonical token tables in parallel with the
  // new system.
  offline: router({
    // RETIRED: replaced by `offlineDoor` + the /offline-door page. Kept as throwing stubs so any old
    // client (or accidental call) fails loudly instead of writing to the canonical token tables.
    exportSnapshot: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(() => {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "The legacy Venue Offline Package has been retired. Use the new offline scanner at /offline-door instead.",
        });
      }),

    syncRedemptions: publicProcedure
      .input(z.object({
        deviceId: z.string(),
        redemptions: z.array(z.object({
          token: z.string(),
          passportType: z.enum(['pool', 'banquet', 'bowling', 'guest-pool']),
          bowlerId: z.number().optional(),
          scannedAt: z.number(),
        })),
      }))
      .mutation(() => {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "The legacy offline sync-back has been retired. The new /offline-door scanner syncs via offlineDoor.sync instead.",
        });
      }),
  }),
  // ─── SUPPORT MESSAGES (bowler login-help form → ED inbox) ──────────────────
  support: router({
    submit: publicProcedure
      .input(z.object({
        bowlerName: z.string().min(1).max(255),
        bowlerCenter: z.string().min(1).max(255),
        contactInfo: z.string().min(1).max(255),
        message: z.string().min(1).max(2000),
        errorMsg: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await rawQuery(
          'INSERT INTO support_messages (bowlerName, bowlerCenter, contactInfo, message, errorMsg, status, createdAt) VALUES (?,?,?,?,?,?,?)',
          [input.bowlerName, input.bowlerCenter, input.contactInfo, input.message, input.errorMsg ?? null, 'new', Date.now()]
        );
        // Notify Cassie immediately when a bowler submits a login-help request
        try {
          const { notifyED } = await import('./notifyED');
          await notifyED({
            title: `🚨 New Login Help Request from ${input.bowlerName}`,
            content: `Bowler: ${input.bowlerName}\nCenter: ${input.bowlerCenter}\nContact: ${input.contactInfo}\n\nMessage: ${input.message}${input.errorMsg ? `\n\nError they saw: ${input.errorMsg}` : ''}`,
          });
        } catch (_) { /* non-fatal */ }
        return { success: true };
      }),

    list: publicProcedure.query(async () => {
      const rows = await rawQuery(
        'SELECT * FROM support_messages ORDER BY createdAt DESC LIMIT 200',
        []
      ) as any[];
      return rows;
    }),

    reply: publicProcedure
      .input(z.object({
        id: z.number(),
        reply: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input }) => {
        await rawQuery(
          'UPDATE support_messages SET edReply=?, status=?, repliedAt=? WHERE id=?',
          [input.reply, 'replied', Date.now(), input.id]
        );
        // Notify owner (Cassie) via built-in notification
        const { notifyED } = await import('./notifyED');
        const row = (await rawQuery('SELECT * FROM support_messages WHERE id=?', [input.id]) as any[])[0];
        await notifyED({
          title: `📬 Reply sent to ${row?.bowlerName ?? 'bowler'}`,
          content: `Your reply was recorded. Bowler: ${row?.bowlerName} | Contact: ${row?.contactInfo}\n\nYour reply: ${input.reply}`,
        });
        return { success: true };
      }),

    markRead: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await rawQuery(
          'UPDATE support_messages SET status=? WHERE id=? AND status=?',
          ['read', input.id, 'new']
        );
        return { success: true };
      }),
  }),

  // ── ED Notifications feed ────────────────────────────────────────────────
  edNotifications: router({
    // List all notifications, newest first (limit 200)
    list: publicProcedure.query(async () => {
      const rows = await rawQuery(
        'SELECT * FROM ed_notifications ORDER BY createdAt DESC LIMIT 200',
        []
      ) as any[];
      return rows;
    }),

    // Mark a single notification as read
    markRead: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await rawQuery('UPDATE ed_notifications SET isRead=1 WHERE id=?', [input.id]);
        return { success: true };
      }),

    // Mark all notifications as read
    markAllRead: publicProcedure.mutation(async () => {
      await rawQuery('UPDATE ed_notifications SET isRead=1 WHERE isRead=0', []);
      return { success: true };
    }),

    // Delete a single notification
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await rawQuery('DELETE FROM ed_notifications WHERE id=?', [input.id]);
        return { success: true };
      }),

    // Clear all read notifications
    clearRead: publicProcedure.mutation(async () => {
      await rawQuery('DELETE FROM ed_notifications WHERE isRead=1', []);
      return { success: true };
    }),
  }),


  // ── Google Credentials (in-app service account management) ─────────────────
  googleCreds: router({
    // Returns whether credentials are saved (never returns the raw JSON)
    status: publicProcedure.query(async () => {
      const { getAppSetting } = await import('./googleSheets');
      const raw = await getAppSetting('google_service_account_json');
      if (!raw) return { saved: false, clientEmail: null };
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return { saved: true, clientEmail: (parsed.client_email as string) ?? null };
      } catch {
        return { saved: true, clientEmail: null };
      }
    }),
    // Save the service account JSON (ED pastes the full JSON)
    save: publicProcedure
      .input(z.object({ json: z.string().min(10) }))
      .mutation(async ({ input }) => {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(input.json);
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid JSON — paste the full contents of the downloaded key file.' });
        }
        if (parsed.type !== 'service_account') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This does not look like a service account key file. Make sure you downloaded a JSON key from Google Cloud Console → IAM → Service Accounts → Keys.' });
        }
        const { setAppSetting } = await import('./googleSheets');
        await setAppSetting('google_service_account_json', input.json);
        return { success: true, clientEmail: (parsed.client_email as string) ?? null };
      }),
    // Delete the stored credentials
    delete: publicProcedure.mutation(async () => {
      const { deleteAppSetting } = await import('./googleSheets');
      await deleteAppSetting('google_service_account_json');
      return { success: true };
    }),
    // Test the credentials against a specific spreadsheet
    test: publicProcedure
      .input(z.object({ spreadsheetId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const { google } = await import('googleapis');
        const { getAppSetting } = await import('./googleSheets');
        let raw = await getAppSetting('google_service_account_json');
        if (!raw) raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? null;
        if (!raw) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No credentials saved yet.' });
        let credentials: Record<string, unknown>;
        try { credentials = JSON.parse(raw); } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Saved credentials are not valid JSON.' });
        }
        try {
          const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
          const sheets = google.sheets({ version: 'v4', auth });
          const idMatch = input.spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
          const bareId = idMatch ? idMatch[1] : input.spreadsheetId;
          const resp = await sheets.spreadsheets.get({ spreadsheetId: bareId, fields: 'spreadsheetId,properties/title' });
          return { success: true, title: resp.data.properties?.title ?? 'Unknown' };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Connection failed: ${msg}` });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
