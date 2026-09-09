import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { assertEventAccess } from "../_core/edAuth";
import { rawExec, rawQuery, withDbTransaction, writeAuditLog } from "../db";
import {
  CLAIM_RESEND_COOLDOWN_MS,
  CLAIM_VERIFICATION_TTL_MS,
  buildClaimVerificationUrl,
  canCompleteClaim,
  generateOpaqueVerificationToken,
  hashClaimEmail,
  isClaimVerificationExpired,
  normalizeClaimEmail,
  sha256,
  type ClaimVerificationStatus,
} from "../claimEmailVerification.logic";
import { isClaimVerificationDeliveryConfigured, sendClaimVerificationEmail } from "../claimVerificationEmail";
import { verifyTurnstileToken } from "../turnstile";

const DEFAULT_APP_ORIGIN = "https://www.bowlvegas.com";

type ClaimCandidate = {
  bowlerId: number;
  claimCodeId: number;
  claimCodeStatus: string;
  rosterEmail: string | null;
  passwordHash: string | null;
  legalFirstName: string;
  legalLastName: string;
  eventName: string;
  eventYear: number | null;
};

type VerificationRow = {
  id: string;
  eventId: number;
  bowlerId: number;
  claimCodeId: number;
  emailHash: string;
  tokenHash: string;
  status: ClaimVerificationStatus;
  requestedAt: number;
  expiresAt: number;
  verifiedAt: number | null;
  consumedAt: number | null;
};

type ResultHeader = { affectedRows: number; insertId: number };

function genericClaimMismatch(): TRPCError {
  return new TRPCError({
    code: "BAD_REQUEST",
    message: "Your name, bowling center, roster email, or claim code did not match the event roster. Please check the information or contact your Event Director.",
  });
}

function resolveSafeAppOrigin(origin?: string): string {
  if (!origin) return process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
  try {
    const parsed = new URL(origin);
    const allowedProductionHost = parsed.protocol === "https:" && (parsed.hostname === "www.bowlvegas.com" || parsed.hostname.endsWith(".manus.space"));
    const allowedLocalHost = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    return allowedProductionHost || allowedLocalHost ? parsed.origin : (process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN);
  } catch {
    return process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
  }
}

async function findClaimCandidate(input: {
  eventId: number;
  centerId: number;
  firstName: string;
  lastName: string;
  claimCode: string;
}): Promise<ClaimCandidate | null> {
  const claimCode = input.claimCode.trim().toUpperCase();
  if (!claimCode) return null;
  const rows = await rawQuery<ClaimCandidate>(
    `SELECT b.id AS bowlerId, c.id AS claimCodeId, c.status AS claimCodeStatus,
            b.email AS rosterEmail, b.passwordHash, b.legalFirstName, b.legalLastName,
            e.eventName, e.eventYear
     FROM bowler_claim_codes c
     INNER JOIN bowlers b ON b.id = c.bowlerId AND b.eventId = c.eventId
     INNER JOIN events e ON e.id = b.eventId
     WHERE c.eventId = ? AND c.code = ? AND b.centerId = ?
       AND LOWER(TRIM(b.legalFirstName)) = LOWER(TRIM(?))
       AND LOWER(TRIM(b.legalLastName)) = LOWER(TRIM(?))
     LIMIT 1`,
    [input.eventId, claimCode, input.centerId, input.firstName, input.lastName],
  );
  return rows[0] ?? null;
}

function createPaperReference(): string {
  return `PT-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export const claimAccessRouter = router({
  policy: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await rawQuery<{ count: number }>("SELECT COUNT(*) AS count FROM bowler_claim_codes WHERE eventId = ?", [input.eventId]);
      const claimCodeRequired = Number(rows[0]?.count ?? 0) > 0;
      return {
        claimCodeRequired,
        emailVerificationRequired: claimCodeRequired,
        emailDeliveryAvailable: isClaimVerificationDeliveryConfigured(),
      };
    }),

  requestEmailVerification: publicProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      centerId: z.number().int().positive(),
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      rosterEmail: z.string().trim().email().max(320),
      claimCode: z.string().trim().min(3).max(20),
      origin: z.string().trim().max(500).optional(),
      turnstileToken: z.string().min(1, "Security check is required"),
    }))
    .mutation(async ({ input, ctx }) => {
      const ip = (ctx as any)?.req?.headers?.["cf-connecting-ip"] as string | undefined
        ?? (ctx as any)?.req?.ip as string | undefined;
      await verifyTurnstileToken(input.turnstileToken, ip);
      // Do not create an unusable record or reveal roster state while delivery is unavailable.
      if (!isClaimVerificationDeliveryConfigured()) {
        return { delivery: "unavailable" as const, retryAfterSeconds: 0 };
      }

      const candidate = await findClaimCandidate(input);
      if (!candidate || candidate.claimCodeStatus !== "unused" || candidate.passwordHash) throw genericClaimMismatch();
      if (!candidate.rosterEmail || hashClaimEmail(candidate.rosterEmail) !== hashClaimEmail(input.rosterEmail)) throw genericClaimMismatch();

      const now = Date.now();
      const recent = await rawQuery<{ requestedAt: number }>(
        `SELECT requestedAt FROM bowler_claim_email_verifications
         WHERE eventId = ? AND bowlerId = ? AND status = 'pending' AND expiresAt > ?
         ORDER BY requestedAt DESC LIMIT 1`,
        [input.eventId, candidate.bowlerId, now],
      );
      const mostRecent = recent[0];
      if (mostRecent && now - Number(mostRecent.requestedAt) < CLAIM_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((CLAIM_RESEND_COOLDOWN_MS - (now - Number(mostRecent.requestedAt))) / 1000);
        return { delivery: "throttled" as const, retryAfterSeconds };
      }

      await rawExec(
        "UPDATE bowler_claim_email_verifications SET status = 'revoked' WHERE eventId = ? AND bowlerId = ? AND status = 'pending'",
        [input.eventId, candidate.bowlerId],
      );
      const generated = generateOpaqueVerificationToken();
      const verificationId = crypto.randomUUID();
      const expiresAt = now + CLAIM_VERIFICATION_TTL_MS;
      await rawExec(
        `INSERT INTO bowler_claim_email_verifications
          (id, eventId, bowlerId, claimCodeId, emailHash, tokenHash, status, requestedAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [verificationId, input.eventId, candidate.bowlerId, candidate.claimCodeId, hashClaimEmail(input.rosterEmail), generated.tokenHash, now, expiresAt],
      );

      const eventLabel = candidate.eventYear ? `${candidate.eventName} ${candidate.eventYear}` : candidate.eventName;
      try {
        const result = await sendClaimVerificationEmail({
          recipientEmail: normalizeClaimEmail(input.rosterEmail),
          recipientFirstName: candidate.legalFirstName,
          eventName: eventLabel,
          verificationUrl: buildClaimVerificationUrl(resolveSafeAppOrigin(input.origin), generated.token),
          expiresInMinutes: CLAIM_VERIFICATION_TTL_MS / 60_000,
        });
        if (!result.delivered) throw new Error("Claim verification delivery is unavailable.");
      } catch {
        await rawExec("UPDATE bowler_claim_email_verifications SET status = 'revoked' WHERE id = ? AND status = 'pending'", [verificationId]);
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Verification email delivery is temporarily unavailable. Your claim code was not redeemed." });
      }

      return { delivery: "sent" as const, retryAfterSeconds: CLAIM_RESEND_COOLDOWN_MS / 1000 };
    }),

  verifyEmailToken: publicProcedure
    .input(z.object({ token: z.string().trim().min(20).max(256) }))
    .mutation(async ({ input }) => {
      const tokenHash = sha256(input.token);
      const rows = await rawQuery<VerificationRow>(
        "SELECT * FROM bowler_claim_email_verifications WHERE tokenHash = ? LIMIT 1",
        [tokenHash],
      );
      const verification = rows[0];
      if (!verification) return { verified: false as const, reason: "invalid" as const };
      const now = Date.now();
      if (isClaimVerificationExpired(Number(verification.expiresAt), now)) {
        await rawExec(
          "UPDATE bowler_claim_email_verifications SET status = 'expired' WHERE id = ? AND status IN ('pending', 'verified')",
          [verification.id],
        );
        return { verified: false as const, reason: "expired" as const };
      }
      if (verification.status === "verified") return { verified: true as const, reason: "already_verified" as const };
      if (verification.status !== "pending") return { verified: false as const, reason: "used" as const };

      const updated = await rawExec(
        "UPDATE bowler_claim_email_verifications SET status = 'verified', verifiedAt = ? WHERE id = ? AND tokenHash = ? AND status = 'pending' AND expiresAt > ?",
        [now, verification.id, tokenHash, now],
      );
      return updated.affectedRows === 1
        ? { verified: true as const, reason: "verified" as const }
        : { verified: false as const, reason: "used" as const };
    }),

  completeSignUp: publicProcedure
    .input(z.object({
      verificationToken: z.string().trim().min(20).max(256),
      password: z.string().min(6, "Password must be at least 6 characters").max(200),
    }))
    .mutation(async ({ input }) => {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const tokenHash = sha256(input.verificationToken);
      const now = Date.now();

      const result = await withDbTransaction(async (connection) => {
        const [verificationRows] = await connection.execute(
          `SELECT id, eventId, bowlerId, claimCodeId, emailHash, tokenHash, status, expiresAt
           FROM bowler_claim_email_verifications WHERE tokenHash = ? FOR UPDATE`,
          [tokenHash],
        ) as unknown as [VerificationRow[], unknown];
        const verification = verificationRows[0];
        if (!verification || !canCompleteClaim(verification.status, Number(verification.expiresAt), now)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "This verification link is invalid, expired, or already used. Request a new email verification link." });
        }

        const [bowlerRows] = await connection.execute(
          `SELECT b.id, b.email, b.passwordHash, b.registrationStatus, b.poolPartyToken, b.banquetToken,
                  b.isCapitain, c.status AS claimCodeStatus, c.bowlerId AS claimCodeBowlerId
           FROM bowlers b
           INNER JOIN bowler_claim_codes c ON c.id = ? AND c.eventId = b.eventId
           WHERE b.id = ? AND b.eventId = ? FOR UPDATE`,
          [verification.claimCodeId, verification.bowlerId, verification.eventId],
        ) as unknown as [Array<{
          id: number; email: string | null; passwordHash: string | null; registrationStatus: string;
          poolPartyToken: string | null; banquetToken: string | null; isCapitain: number;
          claimCodeStatus: string; claimCodeBowlerId: number;
        }>, unknown];
        const bowler = bowlerRows[0];
        if (!bowler || bowler.claimCodeBowlerId !== verification.bowlerId || bowler.claimCodeStatus !== "unused" || !bowler.email || hashClaimEmail(bowler.email) !== verification.emailHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Your claim details changed before completion. Request a new verification email or contact your Event Director." });
        }
        if (bowler.passwordHash) throw new TRPCError({ code: "CONFLICT", message: "An account already exists for this bowler. Please sign in instead." });

        const poolPartyToken = bowler.poolPartyToken ?? crypto.randomUUID().replace(/-/g, "");
        const banquetToken = bowler.banquetToken ?? crypto.randomUUID().replace(/-/g, "");
        const registrationStatus = bowler.registrationStatus === "pre_registered" ? "signed_up" : bowler.registrationStatus;
        const [bowlerUpdate] = await connection.execute(
          "UPDATE bowlers SET passwordHash = ?, poolPartyToken = ?, banquetToken = ?, registrationStatus = ? WHERE id = ? AND passwordHash IS NULL",
          [passwordHash, poolPartyToken, banquetToken, registrationStatus, verification.bowlerId],
        ) as unknown as [ResultHeader, unknown];
        if (bowlerUpdate.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "An account already exists for this bowler. Please sign in instead." });

        const [claimUpdate] = await connection.execute(
          "UPDATE bowler_claim_codes SET status = 'redeemed', redeemedAt = ? WHERE id = ? AND bowlerId = ? AND eventId = ? AND status = 'unused'",
          [now, verification.claimCodeId, verification.bowlerId, verification.eventId],
        ) as unknown as [ResultHeader, unknown];
        if (claimUpdate.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "That claim code is no longer available. Contact your Event Director for help." });

        const [verificationUpdate] = await connection.execute(
          "UPDATE bowler_claim_email_verifications SET status = 'consumed', consumedAt = ? WHERE id = ? AND status = 'verified'",
          [now, verification.id],
        ) as unknown as [ResultHeader, unknown];
        if (verificationUpdate.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "This verification link was already used. Please sign in instead." });

        return { bowlerId: verification.bowlerId, eventId: verification.eventId, isCapitain: Boolean(bowler.isCapitain) };
      });

      await writeAuditLog({
        eventId: result.eventId,
        actorRole: "Bowler",
        action: "claim_email_verified_signup_completed",
        targetId: result.bowlerId,
        targetType: "bowler",
        details: JSON.stringify({ verification: "email", claimCodeRedeemed: true }),
      });
      return { ...result, token: signBowlerToken(result.bowlerId) };
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

function signBowlerToken(bowlerId: number): string {
  const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
  return jwt.sign({ bowlerId, role: "Bowler" }, process.env.JWT_SECRET ?? "dev-secret", { expiresIn: "30d" });
}
