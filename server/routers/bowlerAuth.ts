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
import { writeQRCodesToSheet, writeContactInfoToSheet, writeScanUsedToSheet } from "../googleSheets";
import { getEventSheetTarget } from "../db";
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
    confirmationCode: string | null;
    // payment
    totalAmountDue: string | null;
    paid: number | null;
    // passport tokens
    poolPartyToken: string | null;
    poolPartyUsed: number;
    banquetToken: string | null;
    banquetUsed: number;
    guestPoolPartyAmount: string | null;
    eventId: number | null;
    banquetTable: string | null;
    banquetLocation: string | null;
    banquetTime: string | null;
  }>(
    `SELECT b.id, b.legalFirstName, b.legalLastName, b.preferredName,
            b.email, b.phone, b.scantronId, b.registrationStatus,
            b.isCapitain, b.captainVerified, b.teamId, b.centerId,
            t.teamName, t.teamCode, bc.centerName,
            b.laneNumber, b.squadTime, b.laneToEvent,
            e.eventName, e.bowlingDate,
            h.hotelName, h.checkinDate, h.checkoutDate, h.roomType, h.confirmationCode,
            p.totalAmountDue, p.paid,
            b.poolPartyToken, b.poolPartyUsed, b.banquetToken, b.banquetUsed,
            b.guestPoolPartyAmount, b.eventId,
            b.banquetTable, e.banquetLocation, e.banquetTime
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
  // Fetch guest tokens (pool + banquet)
  const guestTokenRows = await rawQuery<{ suffix: string; token: string; used: number; disabled: number; banquetToken: string | null; banquetUsed: number | null }>(
    `SELECT suffix, token, used, disabled, banquetToken, banquetUsed FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix`,
    [bowlerId]
  );
  const guestPoolQRs: Array<{ suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }> = [];
  const guestBanquetQRs: Array<{ suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }> = [];
  for (const gt of guestTokenRows) {
    if (gt.disabled) continue;
    // pool token = the primary `token` only when it is an actual pool pass (not a -BQ banquet-only placeholder)
    if (gt.token && !gt.token.endsWith("-BQ")) {
      const qrDataUrl = await QRCode.toDataURL(`${appOrigin}/scan/guest-pool/${gt.token}`, { width: 300, margin: 2 });
      guestPoolQRs.push({ suffix: gt.suffix, qrDataUrl, used: Boolean(gt.used), disabled: false });
    }
    if (gt.banquetToken) {
      const qrDataUrl = await QRCode.toDataURL(`${appOrigin}/scan/guest-banquet/${gt.banquetToken}`, { width: 300, margin: 2 });
      guestBanquetQRs.push({ suffix: gt.suffix, qrDataUrl, used: Boolean(gt.banquetUsed), disabled: false });
    }
  }
  return { ...row, poolPartyQR, banquetQR, guestPoolQRs, guestBanquetQRs };
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

      // Reuse passport tokens pre-generated at import time.
      // Only generate new ones if somehow missing (safety fallback).
      const bowlerRow = await rawQuery<{ poolPartyToken: string | null; banquetToken: string | null }>(
        `SELECT poolPartyToken, banquetToken FROM bowlers WHERE id = ? LIMIT 1`,
        [bowler.id]
      );
      const existingPoolToken   = bowlerRow[0]?.poolPartyToken ?? null;
      const existingBanquetToken = bowlerRow[0]?.banquetToken ?? null;
      const poolPartyToken  = existingPoolToken   ?? uuidv4().replace(/-/g, "");
      const banquetToken    = existingBanquetToken ?? uuidv4().replace(/-/g, "");

      // Update the bowler record with password + (possibly new) passport tokens + optional contact info
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

      // Guest pool party tokens: reuse pre-generated ones from import (scantronId+A, +B, …).
      // Only create them now if they were not generated at import (safety fallback).
      const existingGuests = await rawQuery<{ suffix: string; token: string }>(
        `SELECT suffix, token FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix`,
        [bowler.id]
      );
      const SUFFIXES = ["A","B","C","D","E"];
      const bowlerScantronId = String(bowler.scantronId ?? bowler.id).padStart(10, "0");
      const guestAmount = parseFloat(bowler.guestPoolPartyAmount ?? "0") || 0;
      const guestCount = Math.floor(guestAmount / 15);
      if (guestCount > 0 && existingGuests.length === 0) {
        // Fallback: create tokens if import didn't generate them
        for (let i = 0; i < Math.min(guestCount, SUFFIXES.length); i++) {
          const guestToken = `${bowlerScantronId}${SUFFIXES[i]}`;
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

      // QR tokens were pre-generated at import time — no generation needed here.
      // Fallback: if somehow tokens are missing (pre-import data), create them now.
      const appOrigin = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";
      (async () => {
        try {
          const profile = await getBowlerProfile(bowler.id);
          if (!profile) return;

          // Safety fallback: create guest tokens if import didn't generate them
          const guestAmount = parseFloat(bowler.guestPoolPartyAmount ?? "0") || 0;
          const guestCount = Math.floor(guestAmount / 15);
          if (guestCount > 0) {
            const existing = await rawQuery<{ count: number }>(
              `SELECT COUNT(*) as count FROM guest_pool_party_tokens WHERE bowlerId = ?`, [bowler.id]
            );
            if ((existing[0]?.count ?? 0) === 0) {
              const SUFFIXES = ["A","B","C","D","E"];
              const bowlerSid = String(bowler.scantronId ?? bowler.id).padStart(10, "0");
              for (let i = 0; i < Math.min(guestCount, SUFFIXES.length); i++) {
                const guestToken = `${bowlerSid}${SUFFIXES[i]}`;
                await rawQuery(
                  `INSERT INTO guest_pool_party_tokens (bowlerId, suffix, token) VALUES (?, ?, ?)`,
                  [bowler.id, SUFFIXES[i], guestToken]
                );
              }
              // Also write the newly-created QR URLs to the sheet
              const newGuests = await rawQuery<{ suffix: string; token: string }>(
                `SELECT suffix, token FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix`,
                [bowler.id]
              );
              await writeQRCodesToSheet({
                firstName: profile.legalFirstName,
                lastName: profile.legalLastName,
                laneNumber: profile.laneNumber ?? null,
                banquetToken: profile.banquetToken ?? null,
                poolPartyToken: profile.poolPartyToken ?? null,
                guestPoolTokens: newGuests.map(g => ({ suffix: g.suffix, token: g.token })),
                appOrigin,
                target: profile.eventId ? await getEventSheetTarget(profile.eventId) : undefined,
              });
            }
          }
        } catch (err) {
          console.error("[googleSheets] signIn write-back failed:", err);
        }
      })();

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
        isCapitain: number; eventId: number | null;
      }>(
        `SELECT b.id, b.legalFirstName, b.legalLastName, b.scantronId,
                b.phone, b.email, b.squadTime, b.laneNumber, b.laneToEvent,
                b.poolPartyToken, b.poolPartyUsed, b.banquetToken, b.banquetUsed,
                b.isCapitain, b.eventId,
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

      // Guest pool party tokens are pre-generated at import time.
      // Safety fallback: create them here only if they are missing.
      const bowlerForGuest = await rawQuery<{ guestPoolPartyAmount: string | null; scantronId: string | null }>(
        `SELECT guestPoolPartyAmount, scantronId FROM bowlers WHERE id = ? LIMIT 1`, [bowlerId]
      );
      const guestAmountSCI = parseFloat(bowlerForGuest[0]?.guestPoolPartyAmount ?? "0") || 0;
      const guestCountSCI = Math.floor(guestAmountSCI / 15);
      if (guestCountSCI > 0) {
        const existingGuest = await rawQuery<{ count: number }>(
          `SELECT COUNT(*) as count FROM guest_pool_party_tokens WHERE bowlerId = ?`, [bowlerId]
        );
        if ((existingGuest[0]?.count ?? 0) === 0) {
          const SUFFIXES_SCI = ["A","B","C","D","E"];
          const bowlerSidSCI = String(bowlerForGuest[0]?.scantronId ?? bowlerId).padStart(10, "0");
          for (let i = 0; i < Math.min(guestCountSCI, SUFFIXES_SCI.length); i++) {
            const guestToken = `${bowlerSidSCI}${SUFFIXES_SCI[i]}`;
            await rawQuery(
              `INSERT INTO guest_pool_party_tokens (bowlerId, suffix, token) VALUES (?, ?, ?)`,
              [bowlerId, SUFFIXES_SCI[i], guestToken]
            );
          }
        }
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
      (async () => {
        const sheetTarget = profile.eventId ? await getEventSheetTarget(profile.eventId) : undefined;
        return writeQRCodesToSheet({
          firstName: profile.legalFirstName,
          lastName: profile.legalLastName,
          laneNumber: profile.laneNumber ?? null,
          banquetToken: profile.banquetToken ?? null,
          poolPartyToken: profile.poolPartyToken ?? null,
          guestPoolTokens: guestTokenRows.filter(g => !g.disabled).map(g => ({ suffix: g.suffix, token: g.token })),
          appOrigin,
          target: sheetTarget,
        });
      })().catch((err) => console.error("[googleSheets] write-back failed:", err));

      return { ...profile, poolPartyQR, banquetQR, guestPoolQRs };
    }),

  // ── SCAN PASSPORT (doorman scans QR) ────────────────────────────────────────
  scanPassport: publicProcedure
    .input(z.object({
      tokenValue: z.string().min(1),
      passportType: z.enum(["pool", "banquet", "guest-pool", "guest-banquet"]),
    }))
    .mutation(async ({ input }) => {
      // ── Guest banquet token (separate table) ─────────────────────────────────
      if (input.passportType === "guest-banquet") {
        const guestRows = await rawQuery<{
          id: number; suffix: string; banquetUsed: number; disabled: number;
          legalFirstName: string; legalLastName: string; eventId: number | null;
        }>(
          `SELECT g.id, g.suffix, g.banquetUsed, g.disabled,
                  b.legalFirstName, b.legalLastName, b.eventId
           FROM guest_pool_party_tokens g
           JOIN bowlers b ON b.id = g.bowlerId
           WHERE g.banquetToken = ? LIMIT 1`,
          [input.tokenValue]
        );
        if (!guestRows[0]) {
          return { result: "invalid" as const, message: "Invalid QR Code — guest banquet token not found." };
        }
        const g = guestRows[0];
        const bowlerName = `${g.legalFirstName} ${g.legalLastName}`;
        if (g.disabled) {
          return { result: "disabled" as const, message: "Not Eligible — See Event Director", bowlerName };
        }
        if (g.banquetUsed) {
          return { result: "used" as const, message: "Already Redeemed", bowlerName };
        }
        await rawQuery(`UPDATE guest_pool_party_tokens SET banquetUsed = 1 WHERE id = ?`, [g.id]);
        (async () => {
          const t = g.eventId ? await getEventSheetTarget(g.eventId) : undefined;
          return writeScanUsedToSheet({
            firstName: g.legalFirstName,
            lastName: g.legalLastName,
            laneNumber: null,
            type: "guest_pool",
            target: t,
          });
        })().catch((err) => console.error("[googleSheets] guest_banquet scan write-back failed:", err));
        return {
          result: "granted" as const,
          message: `Guest Banquet Entry Granted (Pass ${g.suffix})`,
          bowlerName,
        };
      }

      // ── Guest pool party token (separate table) ──────────────────────────────
      if (input.passportType === "guest-pool") {
        const guestRows = await rawQuery<{
          id: number; bowlerId: number; suffix: string; used: number; disabled: number;
          legalFirstName: string; legalLastName: string; eventId: number | null;
        }>(
          `SELECT g.id, g.bowlerId, g.suffix, g.used, g.disabled,
                  b.legalFirstName, b.legalLastName, b.eventId
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
        // Fire-and-forget: write scan timestamp to Google Sheet column AG
        (async () => {
          const t = g.eventId ? await getEventSheetTarget(g.eventId) : undefined;
          return writeScanUsedToSheet({
            firstName: g.legalFirstName,
            lastName: g.legalLastName,
            laneNumber: null,
            type: "guest_pool",
            target: t,
          });
        })().catch((err) => console.error("[googleSheets] guest_pool scan write-back failed:", err));
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
        banquetToken: string | null; banquetUsed: number; eventId: number | null;
      }>(
        `SELECT id, legalFirstName, legalLastName, poolPartyToken, poolPartyUsed, banquetToken, banquetUsed, eventId
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
      // Fire-and-forget: write scan timestamp to Google Sheet (AC=banquet, AE=pool)
      (async () => {
        const t = bowler.eventId ? await getEventSheetTarget(bowler.eventId) : undefined;
        return writeScanUsedToSheet({
          firstName: bowler.legalFirstName,
          lastName: bowler.legalLastName,
          laneNumber: null,
          type: input.passportType as "banquet" | "pool",
          target: t,
        });
      })().catch((err) => console.error("[googleSheets] scan write-back failed:", err));
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

  // ── DISABLE / ENABLE INDIVIDUAL GUEST POOL PASS ──────────────────────────────
  disableGuestPass: publicProcedure
    .input(z.object({ token: z.string(), bowlerId: z.number(), suffix: z.string() }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      await rawQuery(
        `UPDATE guest_pool_party_tokens SET disabled = 1 WHERE bowlerId = ? AND suffix = ?`,
        [input.bowlerId, input.suffix]
      );
      return { success: true };
    }),

  enableGuestPass: publicProcedure
    .input(z.object({ token: z.string(), bowlerId: z.number(), suffix: z.string() }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      await rawQuery(
        `UPDATE guest_pool_party_tokens SET disabled = 0 WHERE bowlerId = ? AND suffix = ?`,
        [input.bowlerId, input.suffix]
      );
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
      // Fetch guest pool tokens for all bowlers in one query
      const bowlerIds = rows.map(r => r.id);
      const guestTokenMap: Record<number, Array<{ suffix: string; token: string; used: number; disabled: number }>> = {};
      if (bowlerIds.length > 0) {
        const placeholders = bowlerIds.map(() => "?").join(",");
        const guestRows = await rawQuery<{ bowlerId: number; suffix: string; token: string; used: number; disabled: number }>(
          `SELECT bowlerId, suffix, token, used, disabled FROM guest_pool_party_tokens WHERE bowlerId IN (${placeholders}) ORDER BY suffix`,
          bowlerIds
        );
        for (const gr of guestRows) {
          if (!guestTokenMap[gr.bowlerId]) guestTokenMap[gr.bowlerId] = [];
          guestTokenMap[gr.bowlerId].push(gr);
        }
      }
      const appOrigin = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";
      return rows.map(r => ({
        ...r,
        poolPartyUrl: r.poolPartyToken ? `${appOrigin}/scan/pool/${r.poolPartyToken}` : null,
        banquetUrl: r.banquetToken ? `${appOrigin}/scan/banquet/${r.banquetToken}` : null,
        guestPoolTokens: (guestTokenMap[r.id] ?? []).map(g => ({
          suffix: g.suffix,
          url: `${appOrigin}/scan/guest-pool/${g.token}`,
          used: Boolean(g.used),
          disabled: Boolean(g.disabled),
        })),
      }));
    }),

  // ── SUBMIT CONTACT REQUEST (bowler submits phone + email when info is missing) ──
  submitContactRequest: publicProcedure
    .input(z.object({
      token: z.string(),
      phone: z.string().regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
      email: z.string().email("Invalid email address"),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || typeof payload.bowlerId !== "number") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session." });
      }
      const bowlerId = payload.bowlerId as number;
      const bowler = await getBowlerProfile(bowlerId);
      if (!bowler) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });

      // Cancel any existing pending request for this bowler
      await rawQuery(`UPDATE contact_requests SET status = 'rejected' WHERE bowlerId = ? AND status = 'pending'`, [bowlerId]);

      const now = Date.now();
      await rawQuery(
        `INSERT INTO contact_requests (bowlerId, eventId, phone, email, status, createdAt) VALUES (?, ?, ?, ?, 'pending', ?)`,
        [bowlerId, bowler.eventId ?? 0, input.phone, input.email, now]
      );

      // Notify Event Director
      const name = `${bowler.legalFirstName ?? ""} ${bowler.legalLastName ?? ""}`.trim();
      notifyOwner({
        title: `📱 Contact Info Submitted: ${name}`,
        content: `Bowler ${name} (ID: ${bowler.scantronId ?? bowlerId}) has submitted their contact info:\n\nPhone: ${input.phone}\nEmail: ${input.email}\n\nPlease review and confirm in the Event Director portal → Roster → Contact Requests.`,
      }).catch(() => {});

      return { success: true };
    }),

  // ── LIST CONTACT REQUESTS (Event Director) ──────────────────────────────────
  listContactRequests: publicProcedure
    .input(z.object({ token: z.string(), eventId: z.number() }))
    .query(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      const rows = await rawQuery<{
        id: number; bowlerId: number; phone: string; email: string;
        status: string; createdAt: number; confirmedAt: number | null;
        legalFirstName: string | null; legalLastName: string | null;
        scantronId: string | null; laneNumber: number | null;
        centerName: string | null; teamName: string | null;
      }>(
        `SELECT cr.id, cr.bowlerId, cr.phone, cr.email, cr.status, cr.createdAt, cr.confirmedAt,
                b.legalFirstName, b.legalLastName, b.scantronId, b.laneNumber,
                bc.centerName, t.teamName
         FROM contact_requests cr
         JOIN bowlers b ON b.id = cr.bowlerId
         LEFT JOIN bowling_centers bc ON bc.id = b.centerId
         LEFT JOIN teams t ON t.id = b.teamId
         WHERE cr.eventId = ?
         ORDER BY cr.createdAt DESC`,
        [input.eventId]
      );
      return rows;
    }),

  // ── CONFIRM CONTACT REQUEST (ED confirms → updates DB + writes to Google Sheet) ──
  confirmContactRequest: publicProcedure
    .input(z.object({ token: z.string(), requestId: z.number() }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.token);
      if (!payload || payload.role !== "EventDirector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required." });
      }
      const [req] = await rawQuery<{
        id: number; bowlerId: number; phone: string; email: string; status: string;
      }>(`SELECT id, bowlerId, phone, email, status FROM contact_requests WHERE id = ? LIMIT 1`, [input.requestId]);
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending." });

      // Update bowler phone + email in DB
      await rawQuery(`UPDATE bowlers SET phone = ?, email = ? WHERE id = ?`, [req.phone, req.email, req.bowlerId]);
      await rawQuery(`UPDATE contact_requests SET status = 'confirmed', confirmedAt = ? WHERE id = ?`, [Date.now(), req.id]);

      // Write to Google Sheet (fire-and-forget)
      const bowler = await getBowlerProfile(req.bowlerId);
      if (bowler) {
        (async () => {
          const t = bowler.eventId ? await getEventSheetTarget(bowler.eventId) : undefined;
          return writeContactInfoToSheet({
            firstName: bowler.legalFirstName ?? "",
            lastName: bowler.legalLastName ?? "",
            laneNumber: bowler.laneNumber ?? null,
            phone: req.phone,
            email: req.email,
            target: t,
          });
        })().catch((err: unknown) => console.error("[googleSheets] writeContactInfo failed:", err));
      }

      return { success: true };
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
