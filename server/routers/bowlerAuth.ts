/**
 * bowlerAuth router
 * Sign-up / sign-in for Bowlers and Team Captains.
 * Uses the existing bowlers.passwordHash column — no new table needed.
 * JWT is stored in localStorage (separate from the Manus OAuth session cookie).
 * Cloudflare Turnstile token is verified server-side on every sign-in/sign-up.
 */
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { rawQuery } from "../db";
import { notifyOwner } from "../_core/notification";
import { writeQRCodesToSheet } from "../googleSheets";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
const TOKEN_TTL = "30d";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY ?? "";

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Cloudflare Turnstile server-side verification ────────────────────────────
async function verifyTurnstile(token: string, ip?: string): Promise<void> {
  // In test/CI environments where no secret is configured, skip verification
  if (!TURNSTILE_SECRET || TURNSTILE_SECRET === "") return;

  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });

  let result: { success: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    result = (await res.json()) as typeof result;
  } catch {
    // Network error — fail open in dev, fail closed in production
    if (process.env.NODE_ENV === "production") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Security check could not be verified. Please try again." });
    }
    return;
  }

  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Security check failed. Please refresh the page and try again.",
    });
  }
}

// ─── SHARED: look up a bowler by full name + event (+ optional centerId) ─────
async function findBowlerByName(
  firstName: string,
  lastName: string,
  eventId: number,
  centerId?: number
) {
  const centerClause = centerId ? "AND b.centerId = ?" : "";
  const params: unknown[] = centerId
    ? [eventId, firstName, lastName, centerId]
    : [eventId, firstName, lastName];
  const rows = await rawQuery<{
    id: number;
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    scantronId: string | null;
    registrationStatus: string;
    passwordHash: string | null;
    isCapitain: number;
    teamId: number | null;
    centerId: number | null;
    teamName: string | null;
    centerName: string | null;
    laneNumber: number | null;
    squadTime: string | null;
    guestPoolPartyAmount: string | null;
  }>(
    `SELECT b.id, b.legalFirstName, b.legalLastName, b.preferredName,
            b.email, b.phone, b.scantronId, b.registrationStatus,
            b.passwordHash, b.isCapitain, b.teamId, b.centerId,
            t.teamName, bc.centerName,
            b.laneNumber, b.squadTime, b.guestPoolPartyAmount
     FROM bowlers b
     LEFT JOIN teams t ON t.id = b.teamId
     LEFT JOIN bowling_centers bc ON bc.id = b.centerId
     WHERE b.eventId = ?
       AND LOWER(TRIM(b.legalFirstName)) = LOWER(TRIM(?))
       AND LOWER(TRIM(b.legalLastName))  = LOWER(TRIM(?))
       ${centerClause}
     LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}

// ─── SHARED: get full bowler profile for dashboard ────────────────────────────
async function getBowlerProfile(bowlerId: number) {
  const rows = await rawQuery<{
    id: number;
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    scantronId: string | null;
    registrationStatus: string;
    isCapitain: number;
    captainVerified: number;
    teamId: number | null;
    centerId: number | null;
    teamName: string | null;
    teamCode: string | null;
    centerName: string | null;
    laneNumber: number | null;
    squadTime: string | null;
    laneToEvent: string | null;
    eventName: string | null;
    bowlingDate: string | null;
    // hotel
    hotelName: string | null;
    checkinDate: string | null;
    checkoutDate: string | null;
    roomType: string | null;
    // payment
    totalAmountDue: string | null;
    paid: number | null;
    // passport tokens
    poolPartyToken: string | null;
    poolPartyUsed: number;
    banquetToken: string | null;
    banquetUsed: number;
    guestPoolPartyAmount: string | null;
  }>(
    `SELECT b.id, b.legalFirstName, b.legalLastName, b.preferredName,
            b.email, b.phone, b.scantronId, b.registrationStatus,
            b.isCapitain, b.captainVerified, b.teamId, b.centerId,
            t.teamName, t.teamCode, bc.centerName,
            b.laneNumber, b.squadTime, b.laneToEvent,
            e.eventName, e.bowlingDate,
            h.hotelName, h.checkinDate, h.checkoutDate, h.roomType,
            p.totalAmountDue, p.paid,
            b.poolPartyToken, b.poolPartyUsed, b.banquetToken, b.banquetUsed,
            b.guestPoolPartyAmount
     FROM bowlers b
     LEFT JOIN teams t ON t.id = b.teamId
     LEFT JOIN bowling_centers bc ON bc.id = b.centerId
     LEFT JOIN events e ON e.id = b.eventId
     LEFT JOIN hotel_records h ON h.bowlerId = b.id
     LEFT JOIN payment_records p ON p.bowlerId = b.id
     WHERE b.id = ?
     LIMIT 1`,
    [bowlerId]
  );
  const row = rows[0] ?? null;
  if (!row) return null;
  // Generate QR data URLs for passport tokens
  const appOrigin = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";
  let poolPartyQR: string | null = null;
  let banquetQR: string | null = null;
  if (row.poolPartyToken && !row.poolPartyUsed) {
    poolPartyQR = await QRCode.toDataURL(`${appOrigin}/scan/pool/${row.poolPartyToken}`, { width: 300, margin: 2 });
  }
  if (row.banquetToken && !row.banquetUsed) {
    banquetQR = await QRCode.toDataURL(`${appOrigin}/scan/banquet/${row.banquetToken}`, { width: 300, margin: 2 });
  }
  // Fetch guest pool party tokens
  const guestTokenRows = await rawQuery<{ suffix: string; token: string; used: number; disabled: number }>(
    `SELECT suffix, token, used, disabled FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix`,
    [bowlerId]
  );
  const guestPoolQRs: Array<{ suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }> = [];
  for (const gt of guestTokenRows) {
    if (!gt.disabled) {
      const qrDataUrl = await QRCode.toDataURL(`${appOrigin}/scan/guest-pool/${gt.token}`, { width: 300, margin: 2 });
      guestPoolQRs.push({ suffix: gt.suffix, qrDataUrl, used: Boolean(gt.used), disabled: false });
    }
  }
  return { ...row, poolPartyQR, banquetQR, guestPoolQRs };
}

// ─── SHARED: get team roster for captain dashboard ────────────────────────────
async function getTeamRoster(teamId: number) {
  return rawQuery<{
    id: number;
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
    scantronId: string | null;
    registrationStatus: string;
    captainVerified: number;
    isCapitain: number;
    phone: string | null;
    email: string | null;
  }>(
    `SELECT id, legalFirstName, legalLastName, preferredName,
            scantronId, registrationStatus, captainVerified, isCapitain,
            phone, email
     FROM bowlers
     WHERE teamId = ?
     ORDER BY legalLastName, legalFirstName`,
    [teamId]
  );
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
export const bowlerAuthRouter = router({

  // ── LIST CENTERS for sign-up popup ─────────────────────────────────────────
  listCenters: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const rows = await rawQuery<{ id: number; centerName: string }>(
        `SELECT DISTINCT bc.id, bc.centerName
         FROM bowling_centers bc
         INNER JOIN bowlers b ON b.centerId = bc.id AND b.eventId = ?
         ORDER BY bc.centerName`,
        [input.eventId]
      );
      return rows;
    }),

  // ── BOWLER SIGN-UP ──────────────────────────────────────────────────────────
  signUp: publicProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        eventId: z.number(),
        centerId: z.number().int().positive(),
        password: z.string().min(6, "Password must be at least 6 characters"),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        turnstileToken: z.string().min(1, "Security check is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify Turnstile token first
      const ip = (ctx as any)?.req?.headers?.["cf-connecting-ip"] as string | undefined
        ?? (ctx as any)?.req?.ip as string | undefined;
      await verifyTurnstile(input.turnstileToken, ip);

      // Look up bowler by first name + last name + center (3-field match)
      const bowler = await findBowlerByName(input.firstName, input.lastName, input.eventId, input.centerId);

      if (!bowler) {
        // Notify ED of failed sign-up attempt
        notifyOwner({
          title: "⚠️ Unknown Bowler Sign-Up Attempt",
          content: `Someone tried to sign up but was NOT found in the roster.\n\nName entered: ${input.firstName} ${input.lastName}\nCenter ID: ${input.centerId}\nIP: ${ip ?? "unknown"}\n\nIf this is a valid bowler, add them to the roster and re-import.`,
        }).catch(() => {});
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No bowler found matching that name and bowling center. Please check your spelling or contact your Event Director.",
        });
      }

      if (bowler.passwordHash) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An account already exists for this bowler. Please sign in instead.",
        });
      }

      const hash = await bcrypt.hash(input.password, 12);

      // Generate unique passport tokens
      const poolPartyToken = uuidv4().replace(/-/g, "");
      const banquetToken = uuidv4().replace(/-/g, "");

      // Update the bowler record with password + passport tokens + optional contact info
      const updates: string[] = ["passwordHash = ?", "poolPartyToken = ?", "banquetToken = ?"];
      const params: unknown[] = [hash, poolPartyToken, banquetToken];

      if (input.email && !bowler.email) {
        updates.push("email = ?");
        params.push(input.email);
      }
      if (input.phone && !bowler.phone) {
        updates.push("phone = ?");
        params.push(input.phone);
      }
      // Advance status to signed_up if still pre_registered
      if (bowler.registrationStatus === "pre_registered") {
        updates.push("registrationStatus = 'signed_up'");
      }
      params.push(bowler.id);

      await rawQuery(`UPDATE bowlers SET ${updates.join(", ")} WHERE id = ?`, params);

      // Generate guest pool party tokens: each $15 = 1 extra QR code (suffix A, B, C...)
      const guestAmount = parseFloat(bowler.guestPoolPartyAmount ?? "0") || 0;
      const guestCount = Math.floor(guestAmount / 15);
      const SUFFIXES = ["A","B","C","D","E"];
      if (guestCount > 0) {
        // Remove any existing guest tokens for this bowler first (idempotent)
        await rawQuery(`DELETE FROM guest_pool_party_tokens WHERE bowlerId = ?`, [bowler.id]);
        for (let i = 0; i < Math.min(guestCount, SUFFIXES.length); i++) {
          const guestToken = uuidv4().replace(/-/g, "");
          await rawQuery(
            `INSERT INTO guest_pool_party_tokens (bowlerId, suffix, token) VALUES (?, ?, ?)`,
            [bowler.id, SUFFIXES[i], guestToken]
          );
        }
      }

      // Notify ED of successful sign-up (differentiate captain vs bowler)
      const isCapt = Boolean(bowler.isCapitain);
      notifyOwner({
        title: isCapt
          ? `⭐ Team Captain Signed Up: ${bowler.legalFirstName ?? input.firstName} ${bowler.legalLastName ?? input.lastName}`
          : `✅ Bowler Signed Up: ${bowler.legalFirstName ?? input.firstName} ${bowler.legalLastName ?? input.lastName}`,
        content: `${isCapt ? "A TEAM CAPTAIN" : "A bowler"} has created their account.\n\nName: ${bowler.legalFirstName ?? input.firstName} ${bowler.legalLastName ?? input.lastName}\nCenter: ${bowler.centerName ?? "Unknown"}\nTeam: ${bowler.teamName ?? "Unknown"}\nBowler ID: ${String(bowler.scantronId ?? bowler.id).padStart(10, "0")}${isCapt ? "\n\n⚠️ This bowler is a TEAM CAPTAIN — they can verify their team members." : ""}`,
      }).catch(() => {});

      const token = signToken({ bowlerId: bowler.id, role: "Bowler" });
      return { token, bowlerId: bowler.id, isCapitain: Boolean(bowler.isCapitain) };
    }),

  // ── BOWLER SIGN-IN ──────────────────────────────────────────────────────────
  signIn: publicProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        eventId: z.number(),
        password: z.string().min(1),
        turnstileToken: z.string().min(1, "Security check is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify Turnstile token first
      const ip = (ctx as any)?.req?.headers?.["cf-connecting-ip"] as string | undefined
        ?? (ctx as any)?.req?.ip as string | undefined;
      await verifyTurnstile(input.turnstileToken, ip);

      const bowler = await findBowlerByName(input.firstName, input.lastName, input.eventId);

      if (!bowler) {
        // Notify ED of failed sign-in attempt (name not found)
        notifyOwner({
          title: "⚠️ Failed Sign-In: Name Not Found",
          content: `Someone tried to sign in but their name was not found in the roster.\n\nName entered: ${input.firstName} ${input.lastName}\nIP: ${ip ?? "unknown"}`,
        }).catch(() => {});
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No bowler found with that name. Please check your spelling.",
        });
      }

      if (!bowler.passwordHash) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account exists for this bowler. Please sign up first.",
        });
      }

      const valid = await bcrypt.compare(input.password, bowler.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
      }

      const token = signToken({ bowlerId: bowler.id, role: "Bowler" });

      // Fire-and-forget: sync QR URLs to Google Sheet on every sign-in
      // (ensures sheet stays current even for bowlers who signed up before sheet integration)
      const appOrigin = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";
      getBowlerProfile(bowler.id).then((profile) => {
        if (!profile) return;
        writeQRCodesToSheet({
          firstName: profile.legalFirstName,
          lastName: profile.legalLastName,
          laneNumber: profile.laneNumber ?? null,
          banquetToken: profile.banquetToken ?? null,
          poolPartyToken: profile.poolPartyToken ?? null,
          appOrigin,
        }).catch((err) => console.error("[googleSheets] signIn write-back failed:", err));
      }).catch(() => {});

      return { token, bowlerId: bowler.id, isCapitain: Boolean(bowler.isCapitain) };
    }),

  // ── BOWLER: GET MY PROFILE ──────────────────────────────────────────────────
  me: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || typeof payload.bowlerId !== "number") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session." });
      }
      const profile = await getBowlerProfile(payload.bowlerId as number);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });
      return profile;
    }),

  // ── CAPTAIN: GET TEAM ROSTER ────────────────────────────────────────────────
  myTeam: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || typeof payload.bowlerId !== "number") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session." });
      }
      const profile = await getBowlerProfile(payload.bowlerId as number);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });
      if (!profile.isCapitain) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This account is not a team captain." });
      }
      if (!profile.teamId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No team assigned to this captain." });
      }
      const roster = await getTeamRoster(profile.teamId);
      return { profile, roster };
    }),

  // ── SUBMIT CONTACT INFO (phone + email after sign-up) ─────────────────────
  submitContactInfo: publicProcedure
    .input(z.object({
      token: z.string(),
      phone: z.string().min(7).optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || typeof payload.bowlerId !== "number") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session." });
      }
      const bowlerId = payload.bowlerId as number;
      const updates: string[] = [];
      const params: unknown[] = [];
      if (input.phone) { updates.push("phone = ?"); params.push(input.phone); }
      if (input.email) { updates.push("email = ?"); params.push(input.email); }
      if (updates.length > 0) {
        params.push(bowlerId);
        await rawQuery(`UPDATE bowlers SET ${updates.join(", ")} WHERE id = ?`, params);
      }
      // Return full profile with passport tokens
      const rows = await rawQuery<{
        id: number; legalFirstName: string; legalLastName: string;
        scantronId: string | null; phone: string | null; email: string | null;
        squadTime: string | null; laneNumber: number | null; laneToEvent: string | null;
        teamName: string | null; centerName: string | null;
        eventName: string | null; startDate: string | null; endDate: string | null; bowlingDate: string | null;
        poolPartyToken: string | null; poolPartyUsed: number;
        banquetToken: string | null; banquetUsed: number;
        isCapitain: number;
      }>(
        `SELECT b.id, b.legalFirstName, b.legalLastName, b.scantronId,
                b.phone, b.email, b.squadTime, b.laneNumber, b.laneToEvent,
                b.poolPartyToken, b.poolPartyUsed, b.banquetToken, b.banquetUsed,
                b.isCapitain,
                t.teamName, bc.centerName,
                e.eventName, e.startDate, e.endDate, e.bowlingDate
         FROM bowlers b
         LEFT JOIN teams t ON t.id = b.teamId
         LEFT JOIN bowling_centers bc ON bc.id = b.centerId
         LEFT JOIN events e ON e.id = b.eventId
         WHERE b.id = ? LIMIT 1`,
        [bowlerId]
      );
      const profile = rows[0];
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });

      // Generate QR code data URLs for client display
      const appOrigin = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";
      let poolPartyQR: string | null = null;
      let banquetQR: string | null = null;
      if (profile.poolPartyToken) {
        poolPartyQR = await QRCode.toDataURL(`${appOrigin}/scan/pool/${profile.poolPartyToken}`, { width: 300, margin: 2 });
      }
      if (profile.banquetToken) {
        banquetQR = await QRCode.toDataURL(`${appOrigin}/scan/banquet/${profile.banquetToken}`, { width: 300, margin: 2 });
      }

      // Fetch guest pool tokens for this bowler
      const guestTokenRows = await rawQuery<{ suffix: string; token: string; used: number; disabled: number }>(
        `SELECT suffix, token, used, disabled FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix`,
        [bowlerId]
      );
      const guestPoolQRs: Array<{ suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }> = [];
      for (const gt of guestTokenRows) {
        if (!gt.disabled) {
          const qrDataUrl = await QRCode.toDataURL(`${appOrigin}/scan/guest-pool/${gt.token}`, { width: 300, margin: 2 });
          guestPoolQRs.push({ suffix: gt.suffix, qrDataUrl, used: Boolean(gt.used), disabled: false });
        }
      }

      // Write QR URLs back to Google Sheet (fire-and-forget, never blocks user)
      writeQRCodesToSheet({
        firstName: profile.legalFirstName,
        lastName: profile.legalLastName,
        laneNumber: profile.laneNumber ?? null,
        banquetToken: profile.banquetToken ?? null,
        poolPartyToken: profile.poolPartyToken ?? null,
        guestPoolTokens: guestTokenRows.filter(g => !g.disabled).map(g => ({ suffix: g.suffix, token: g.token })),
        appOrigin,
      }).catch((err) => console.error("[googleSheets] write-back failed:", err));

      return { ...profile, poolPartyQR, banquetQR, guestPoolQRs };
    }),

  // ── SCAN PASSPORT (doorman scans QR) ────────────────────────────────────────
  scanPassport: publicProcedure
    .input(z.object({
      tokenValue: z.string().min(1),
      passportType: z.enum(["pool", "banquet", "guest-pool"]),
    }))
    .mutation(async ({ input }) => {
      // ── Guest pool party token (separate table) ──────────────────────────────
      if (input.passportType === "guest-pool") {
        const guestRows = await rawQuery<{
          id: number; bowlerId: number; suffix: string; used: number; disabled: number;
          legalFirstName: string; legalLastName: string;
        }>(
          `SELECT g.id, g.bowlerId, g.suffix, g.used, g.disabled,
                  b.legalFirstName, b.legalLastName
           FROM guest_pool_party_tokens g
           JOIN bowlers b ON b.id = g.bowlerId
           WHERE g.token = ? LIMIT 1`,
          [input.tokenValue]
        );
        if (!guestRows[0]) {
          return { result: "invalid" as const, message: "Invalid QR Code — guest token not found." };
        }
        const g = guestRows[0];
        const bowlerName = `${g.legalFirstName} ${g.legalLastName}`;
        if (g.disabled) {
          return { result: "disabled" as const, message: "Not Eligible — See Event Director", bowlerName };
        }
        if (g.used) {
          return { result: "used" as const, message: "Already Redeemed", bowlerName };
        }
        await rawQuery(`UPDATE guest_pool_party_tokens SET used = 1 WHERE id = ?`, [g.id]);
        return {
          result: "granted" as const,
          message: `Guest Entry Granted (Pass ${g.suffix})`,
          bowlerName,
        };
      }

      // ── Main bowler pool or banquet token ────────────────────────────────────
      const col = input.passportType === "pool" ? "poolPartyToken" : "banquetToken";
      const usedCol = input.passportType === "pool" ? "poolPartyUsed" : "banquetUsed";
      const rows = await rawQuery<{
        id: number; legalFirstName: string; legalLastName: string;
        poolPartyToken: string | null; poolPartyUsed: number;
        banquetToken: string | null; banquetUsed: number;
      }>(
        `SELECT id, legalFirstName, legalLastName, poolPartyToken, poolPartyUsed, banquetToken, banquetUsed
         FROM bowlers WHERE ${col} = ? LIMIT 1`,
        [input.tokenValue]
      );
      if (!rows[0]) {
        return { result: "invalid" as const, message: "Invalid QR Code — token not found." };
      }
      const bowler = rows[0];
      const isUsed = input.passportType === "pool" ? Boolean(bowler.poolPartyUsed) : Boolean(bowler.banquetUsed);
      const tokenValue = input.passportType === "pool" ? bowler.poolPartyToken : bowler.banquetToken;
      if (tokenValue === null) {
        return { result: "disabled" as const, message: "Not Eligible — See Event Director", bowlerName: `${bowler.legalFirstName} ${bowler.legalLastName}` };
      }
      if (isUsed) {
        return { result: "used" as const, message: "Already Redeemed", bowlerName: `${bowler.legalFirstName} ${bowler.legalLastName}` };
      }
      // Mark as used
      await rawQuery(`UPDATE bowlers SET ${usedCol} = 1 WHERE id = ?`, [bowler.id]);
      return {
        result: "granted" as const,
        message: "Entry Granted",
        bowlerName: `${bowler.legalFirstName} ${bowler.legalLastName}`,
      };
    }),

  // ── DISABLE / ENABLE PASSPORT (Event Director) ──────────────────────────────
  disablePassport: publicProcedure
    .input(z.object({ token: z.string(), bowlerId: z.number(), passportType: z.enum(["pool", "banquet"]) }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      const col = input.passportType === "pool" ? "poolPartyToken" : "banquetToken";
      await rawQuery(`UPDATE bowlers SET ${col} = NULL WHERE id = ?`, [input.bowlerId]);
      return { success: true };
    }),

  enablePassport: publicProcedure
    .input(z.object({ token: z.string(), bowlerId: z.number(), passportType: z.enum(["pool", "banquet"]) }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      const col = input.passportType === "pool" ? "poolPartyToken" : "banquetToken";
      const usedCol = input.passportType === "pool" ? "poolPartyUsed" : "banquetUsed";
      const newToken = uuidv4().replace(/-/g, "");
      await rawQuery(`UPDATE bowlers SET ${col} = ?, ${usedCol} = 0 WHERE id = ?`, [newToken, input.bowlerId]);
      return { success: true };
    }),

  // ── GET PASSPORT STATUS (Event Director list) ────────────────────────────────
  getPassportStatus: publicProcedure
    .input(z.object({ token: z.string(), eventId: z.number() }))
    .query(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      const rows = await rawQuery<{
        id: number; legalFirstName: string; legalLastName: string; scantronId: string | null;
        centerName: string | null; teamName: string | null;
        poolPartyToken: string | null; poolPartyUsed: number;
        banquetToken: string | null; banquetUsed: number;
      }>(
        `SELECT b.id, b.legalFirstName, b.legalLastName, b.scantronId,
                bc.centerName, t.teamName,
                b.poolPartyToken, b.poolPartyUsed, b.banquetToken, b.banquetUsed
         FROM bowlers b
         LEFT JOIN bowling_centers bc ON bc.id = b.centerId
         LEFT JOIN teams t ON t.id = b.teamId
         WHERE b.eventId = ? AND b.passwordHash IS NOT NULL
         ORDER BY b.legalLastName, b.legalFirstName`,
        [input.eventId]
      );
      const appOrigin = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";
      return rows.map(r => ({
        ...r,
        poolPartyUrl: r.poolPartyToken ? `${appOrigin}/scan/pool/${r.poolPartyToken}` : null,
        banquetUrl: r.banquetToken ? `${appOrigin}/scan/banquet/${r.banquetToken}` : null,
      }));
    }),

  // ── CAPTAIN: VERIFY A BOWLER ────────────────────────────────────────────────
  verifyBowler: publicProcedure
    .input(z.object({ token: z.string(), bowlerId: z.number() }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || typeof payload.bowlerId !== "number") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session." });
      }
      const captain = await getBowlerProfile(payload.bowlerId as number);
      if (!captain?.isCapitain || !captain.teamId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a team captain." });
      }
      // Ensure the target bowler is on this captain's team
      const [target] = await rawQuery<{ id: number; teamId: number | null }>(
        "SELECT id, teamId FROM bowlers WHERE id = ? LIMIT 1",
        [input.bowlerId]
      );
      if (!target || target.teamId !== captain.teamId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bowler is not on your team." });
      }
      await rawQuery(
        "UPDATE bowlers SET captainVerified = 1, registrationStatus = 'verified' WHERE id = ?",
        [input.bowlerId]
      );
      return { success: true };
    }),
});
