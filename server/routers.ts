import { z } from "zod";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "@shared/const";
import { bowlerAuthRouter } from "./routers/bowlerAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { broadcastTokenInvalidation } from "./_core/sse";
import {
  getAllCenters, getActiveEvent, getAllEvents, getEventById, createEvent, renameEvent, deleteBowler, getLeaguesByEvent, getTeamsByCenter,
  getBowlersByTeam, getBowlerById, getBowlerByScantronId, searchBowlers,
  matchBowlerForSignup, updateBowlerRegistrationStatus, updateBowler,
  getAllBowlersForAdmin, getAdminStats, getAppUserByUsername, createAppUser,
  getDoormanAccounts, createEntryToken, getTokenByValue, invalidateToken,
  getBowlerActiveToken, createCheckIn, issueWristband, getWristbandByBowler,
  denyWristband, writeAuditLog, getAuditLog, createImportSession,
  updateImportSession, getImportHistory, upsertHotelRecord, upsertPaymentRecord,
  rawQuery, updateTeamStatus, getTeamById,
} from "./db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import QRCode from "qrcode";

// ─── ID GENERATION ────────────────────────────────────────────────────────────
export function generateScantronId(cc: string, l: string, ee: string, tt: string, bb: string): string {
  const id = `${cc.padStart(2, "0")}${l.padStart(1, "0")}${ee.padStart(2, "0")}${tt.padStart(2, "0")}${bb.padStart(2, "0")}`;
  if (id === "0000000000") throw new Error("Reserved test ID — regenerate");
  return id;
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

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
        const HOTEL_FIELDS = ["checkinDate","checkoutDate","roomType","roomNumber","roommateRequested","roommateFirstName","roommateLastName","roomAmount"];
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
      .mutation(async ({ input }) => {
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
      }))
      .mutation(async ({ input }) => {
        const sessionId = await createImportSession({
          eventId: input.eventId,
          importedBy: input.importedBy,
          sourceType: input.sourceType,
          sourceName: input.sourceName,
        });

        let imported = 0, updated = 0, skipped = 0, errors = 0;
        const errorDetails: unknown[] = [];
        const generatedIds: string[] = [];

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
            let centerName = String(row["Center"] ?? row["center"] ?? "").trim();
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
              errorDetails.push({ row: firstName + " " + lastName, error: `Center not found: "${centerName}" — use an official center name from the Bowlero Vegas Funtime League list` });
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

            // Parse hotel/payment data — 22-column B.O.B. layout (Jun 17 v2)
            const checkinDate = String(row["Check In"] ?? row["Check-In Date"] ?? row["checkin_date"] ?? "").trim();
            const checkoutDate = String(row["Check Out"] ?? row["Check-Out Date"] ?? row["checkout_date"] ?? "").trim();
            // Room Type removed from sheet — keep fallback for legacy imports
            const roomType = String(row["Room Type"] ?? row["room_type"] ?? "").trim();
            const roommateFirst = String(row["Roommate First Name"] ?? row["Roommate First"] ?? row["roommate_first"] ?? "").trim();
            const roommateLast = String(row["Roommate Last Name"] ?? row["Roommate Last"] ?? row["roommate_last"] ?? "").trim();
            // roommateRequested: infer from roommate name being present
            const roommateRequested = !!(roommateFirst || roommateLast);
            const roomAmount = parseFloat(String(row["Amount Due"] ?? row["Room Amount Due"] ?? row["Room Amount"] ?? row["room_amount"] ?? "0").replace(/[$,]/g, "")) || 0;
            // Column W: Banquet table assignment (e.g. "Choose a seat at Tables 1, 2, 3, or 4") — set per bowler
            const banquetTable = String(row["Assigned Table #"] ?? row["Assigned Table"] ?? row["banquet_table"] ?? row["Banquet Table"] ?? row["Table #"] ?? "").trim() || undefined;
            // Column X: extra banquet (was previously in a different position)
            const banquetRaw = String(row["extra banquet"] ?? row["Extra Banquet"] ?? row["Banquet $80"] ?? row["Banquet"] ?? row["banquet"] ?? "0").trim();
            const extraBanquet = parseFloat(banquetRaw.replace(/[$,]/g, "")) || 0;
            // Column Y: extra pool party (was previously in a different position)
            const poolPartyRaw = String(row["extra pool party"] ?? row["Extra Pool Party"] ?? row["Guest Pool Party"] ?? row["Guest $15"] ?? row["Pool Party"] ?? "0").replace(/[$,]/g, "").trim();
            const guestPoolPartyRaw = poolPartyRaw;
            const guestPoolPartyAmount = parseFloat(guestPoolPartyRaw) || 0;
            const poolParty = guestPoolPartyAmount > 0 || ["y", "yes", "true", "1", "x"].includes(guestPoolPartyRaw.toLowerCase()) || (poolPartyRaw.includes("PM") || poolPartyRaw.includes("AM"));
            const extraGuestFee = guestPoolPartyAmount;
            const totalAmountDue = parseFloat(String(row["Total Due"] ?? row["Total Amount"] ?? row["total"] ?? "0").replace(/[$,]/g, "")) || 0;
            const notes = String(row["Special Notes"] ?? row["notes"] ?? "").trim();
            // Phone and Email are present but typically empty — accept gracefully
            const phone = String(row["Phone"] ?? row["phone"] ?? "").trim();
            const email = String(row["Email"] ?? row["email"] ?? "").trim();

            // Bowling stats fields
            const sanctionNumber = String(row["Sanction #"] ?? row["sanction_number"] ?? row["Sanction"] ?? "").trim() || undefined;
            const gamesRaw = String(row["# Games"] ?? row["Games"] ?? row["games"] ?? "").trim();
            const gamesPlayed = gamesRaw ? (parseInt(gamesRaw) || undefined) : undefined;
            const avgRaw = String(row["Best Avg"] ?? row["High Avg"] ?? row["Average"] ?? row["avg"] ?? "").trim();
            const bestAverage = avgRaw ? (parseInt(avgRaw) || undefined) : undefined;
            const tshirtSize = String(row["T-Shirt Size"] ?? row["Shirt Size"] ?? row["shirt"] ?? "").trim().toUpperCase() || undefined;
            const under21Raw = String(row["Under 21?"] ?? row["Under 21"] ?? row["under21"] ?? "").trim().toUpperCase();
            const under21 = ["Y", "YES", "TRUE", "1"].includes(under21Raw);
            const leagueMemberRaw = String(row["League Member"] ?? row["league_member"] ?? "").trim().toUpperCase();
            const leagueMember = ["Y", "YES", "TRUE", "1"].includes(leagueMemberRaw);
            const squadTimeVal = String(row["Squad Time"] ?? row["squad_time"] ?? "").trim() || undefined;
            const laneRaw = String(row["Lane #"] ?? row["Lane"] ?? row["lane"] ?? "").trim();
            const laneNumber = laneRaw ? (parseInt(laneRaw) || undefined) : undefined;
            // Column 44 — "Lane to Event" / "Lane to Banquet" directional info
            const laneToEvent = String(row["Lane to Event"] ?? row["Lane to Banquet"] ?? row["lane_to_event"] ?? row["LaneToEvent"] ?? "").trim() || undefined;

            if (existing.length > 0) {
              // Update existing
              const bowlerId = existing[0].id as number;
              await updateBowler(bowlerId, {
                legalFirstName: firstName, legalLastName: lastName,
                teamId, centerId: center.id as number, isCapitain: isCapt,
                notes: notes || undefined,
                phone: phone || undefined, email: email || undefined,
                sanctionNumber, gamesPlayed, bestAverage, tshirtSize,
                under21, leagueMember, squadTime: squadTimeVal, laneNumber, laneToEvent,
                guestPoolPartyAmount: guestPoolPartyAmount.toFixed(2),
                banquetTable: banquetTable || undefined,
              });
              if (checkinDate || checkoutDate || roomType) {
                await upsertHotelRecord(bowlerId, { checkinDate, checkoutDate, roomType, roommateRequested, roommateFirstName: roommateFirst, roommateLastName: roommateLast, roomAmount });
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
                if (checkinDate || checkoutDate || roomType) {
                  await upsertHotelRecord(bowlerId, { checkinDate, checkoutDate, roomType, roommateRequested, roommateFirstName: roommateFirst, roommateLastName: roommateLast, roomAmount });
                }
                const effectiveBanquet2 = extraBanquet;
                const effectivePoolParty2 = poolParty;
                const effectiveExtraGuest2 = extraGuestFee;
                if (effectiveBanquet2 || totalAmountDue || effectivePoolParty2 || effectiveExtraGuest2) {
                  await upsertPaymentRecord(bowlerId, { roomAmount, banquetAmount: effectiveBanquet2, poolParty: effectivePoolParty2, extraGuestFee: effectiveExtraGuest2, totalAmountDue });
                }
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

  // ─── OFFLINE PACKAGE ──────────────────────────────────────────────────────────────────────────────────
  offline: router({
    // Export all active passport tokens + bowler names as a JSON snapshot
    exportSnapshot: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const rows = await rawQuery(
          `SELECT b.id, b.legalFirstName, b.legalLastName, b.scantronId,
                  b.poolPartyToken, b.poolPartyUsed, b.banquetToken, b.banquetUsed,
                  b.banquetTable,
                  et.tokenValue AS bowlingToken, et.isUsed AS bowlingUsed
           FROM bowlers b
           LEFT JOIN entry_tokens et ON et.bowlerId = b.id AND et.eventId = ? AND et.isUsed = 0 AND et.tokenType != 'test'
           WHERE b.eventId = ? AND b.registrationStatus != 'pre_registered'`,
          [input.eventId, input.eventId]
        ) as Record<string, unknown>[];
        // Fetch guest pool tokens for all bowlers in this event
        const guestTokens = await rawQuery(
          `SELECT g.bowlerId, g.suffix, g.token, g.used, g.disabled
           FROM guest_pool_party_tokens g
           INNER JOIN bowlers b ON b.id = g.bowlerId
           WHERE b.eventId = ? AND g.disabled = 0`,
          [input.eventId]
        ) as { bowlerId: number; suffix: string; token: string; used: number; disabled: number }[];
        // Group guest tokens by bowlerId
        const guestMap: Record<number, Array<{ suffix: string; token: string; used: boolean }>> = {};
        for (const gt of guestTokens) {
          if (!guestMap[gt.bowlerId]) guestMap[gt.bowlerId] = [];
          guestMap[gt.bowlerId].push({ suffix: gt.suffix, token: gt.token, used: Boolean(gt.used) });
        }
        // Attach guest tokens to each bowler row
        const enrichedRows = rows.map(b => ({
          ...b,
          guestPoolTokens: guestMap[b.id as number] ?? [],
        }));
        // Use the specific event (not just the active one)
        const event = await getEventById(input.eventId) as Record<string, unknown> | null;
        return {
          exportedAt: Date.now(),
          eventId: input.eventId,
          eventName: event?.eventName ?? 'B.O.B. Roll-off',
          tabletPin: event?.tabletPin ?? null,
          banquetLocation: event?.banquetLocation ?? null,
          banquetTime: event?.banquetTime ?? null,
          bowlers: enrichedRows,
        };
      }),

    // Cloud sync-back: offline server posts redemptions after connectivity returns
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
      .mutation(async ({ input }) => {
        let synced = 0;
        let skipped = 0;
        for (const r of input.redemptions) {
          try {
            if (r.passportType === 'bowling') {
              const token = await getTokenByValue(r.token) as Record<string, unknown> | null;
              if (token && !token.isUsed) {
                await invalidateToken(typeof token.id === 'number' ? token.id : Number(token.id));
                if (r.bowlerId) await createCheckIn(r.bowlerId, typeof token.eventId === 'number' ? token.eventId : 1, 'QR', undefined, typeof token.id === 'number' ? token.id : undefined);
                synced++;
              } else { skipped++; }
            } else if (r.passportType === 'pool') {
              const existing = await rawQuery('SELECT poolPartyUsed FROM bowlers WHERE poolPartyToken=?', [r.token]) as Record<string, unknown>[];
              if (existing[0] && !existing[0].poolPartyUsed) {
                await rawQuery('UPDATE bowlers SET poolPartyUsed=1 WHERE poolPartyToken=?', [r.token]);
                synced++;
              } else { skipped++; }
            } else if (r.passportType === 'banquet') {
              const existing = await rawQuery('SELECT banquetUsed FROM bowlers WHERE banquetToken=?', [r.token]) as Record<string, unknown>[];
              if (existing[0] && !existing[0].banquetUsed) {
                await rawQuery('UPDATE bowlers SET banquetUsed=1 WHERE banquetToken=?', [r.token]);
                synced++;
              } else { skipped++; }
            } else if (r.passportType === 'guest-pool') {
              const existing = await rawQuery('SELECT id, used FROM guest_pool_party_tokens WHERE token=?', [r.token]) as Record<string, unknown>[];
              if (existing[0] && !existing[0].used) {
                await rawQuery('UPDATE guest_pool_party_tokens SET used=1 WHERE token=?', [r.token]);
                synced++;
              } else { skipped++; }
            }
            await rawQuery(
              'INSERT INTO offline_sync_queue (token, passport_type, bowler_id, scanned_at, device_id, synced_to_cloud, synced_at, created_at) VALUES (?,?,?,?,?,1,?,?)',
              [r.token, r.passportType, r.bowlerId ?? null, r.scannedAt, input.deviceId, Date.now(), Date.now()]
            );
          } catch { skipped++; }
        }
        return { success: true, synced, skipped, total: input.redemptions.length };
      }),
  }),
});

export type AppRouter = typeof appRouter;
