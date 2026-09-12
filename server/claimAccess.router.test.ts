import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { rawExec, rawQuery } from "./db";
import type { TrpcContext } from "./_core/context";
import { sha256 } from "./claimEmailVerification.logic";

function staffContext(staffId: number): TrpcContext {
  const token = jwt.sign({ staffId, type: "ed_staff" }, process.env.JWT_SECRET ?? "fallback-secret", { expiresIn: "5m" });
  return {
    user: null,
    req: { protocol: "https", headers: { cookie: `ed_staff_token=${token}` } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function ownerContext(): TrpcContext {
  return {
    user: { id: 1, openId: "claim-owner-test", email: "owner@example.test", name: "Owner Test", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("claim access verification and paper-ticket lifecycle", () => {
  it("requires a verified token before atomically consuming a claim code and keeps paper tickets event scoped", async () => {
    const stamp = Date.now();
    const company = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Claim Access ${stamp}`, `claim-access-${stamp}`]);
    const ownerStaff = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`claim-owner-${stamp}`, "test-hash", "Claim Owner", company.insertId]);
    const otherStaff = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`claim-other-${stamp}`, "test-hash", "Claim Other", company.insertId]);
    const ownedEvent = await rawExec("INSERT INTO events (companyId, createdByStaffId, eventName, eventYear, status) VALUES (?, ?, ?, ?, 'active')", [company.insertId, ownerStaff.insertId, `Claim Owned ${stamp}`, 2099]);
    const blockedEvent = await rawExec("INSERT INTO events (companyId, createdByStaffId, eventName, eventYear, status) VALUES (?, ?, ?, ?, 'active')", [company.insertId, otherStaff.insertId, `Claim Blocked ${stamp}`, 2099]);
    const [center] = await rawQuery<{ id: number }>("SELECT id FROM bowling_centers ORDER BY id ASC LIMIT 1");
    const scanSuffix = String(stamp).slice(-9);
    const ownedBowler = await rawExec("INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, email, scantronId, registrationStatus) VALUES (?, ?, ?, ?, ?, ?, 'pre_registered')", [ownedEvent.insertId, center.id, "Verified", "Bowler", `verified-${stamp}@example.test`, `8${scanSuffix}`]);
    const blockedBowler = await rawExec("INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, email, scantronId, registrationStatus) VALUES (?, ?, ?, ?, ?, ?, 'pre_registered')", [blockedEvent.insertId, center.id, "Blocked", "Bowler", `blocked-${stamp}@example.test`, `9${scanSuffix}`]);
    const claimCode = await rawExec("INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, createdAt) VALUES (?, ?, ?, 'unused', ?)", [ownedEvent.insertId, ownedBowler.insertId, `TEST-${String(stamp).slice(-8)}`, stamp]);
    const rawVerificationToken = `verification-${stamp}-safe-token`;
    const verificationId = crypto.randomUUID();

    try {
      await rawExec(
        `INSERT INTO bowler_claim_email_verifications
          (id, eventId, bowlerId, claimCodeId, emailHash, tokenHash, status, requestedAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [verificationId, ownedEvent.insertId, ownedBowler.insertId, claimCode.insertId, sha256(`verified-${stamp}@example.test`), sha256(rawVerificationToken), stamp, stamp + 60_000],
      );
      const ownerDirector = appRouter.createCaller(staffContext(ownerStaff.insertId));
      const otherDirector = appRouter.createCaller(staffContext(otherStaff.insertId));
      const anonymous = appRouter.createCaller({ user: null, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

      await expect(anonymous.claimAccess.completeSignUp({ verificationToken: rawVerificationToken, password: "SecurePassword123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      const [preVerifyCode] = await rawQuery<{ status: string; passwordHash: string | null }>("SELECT c.status, b.passwordHash FROM bowler_claim_codes c JOIN bowlers b ON b.id = c.bowlerId WHERE c.id = ?", [claimCode.insertId]);
      expect(preVerifyCode).toMatchObject({ status: "unused", passwordHash: null });

      await expect(anonymous.claimAccess.verifyEmailToken({ token: "not-a-real-opaque-token-value" })).resolves.toEqual({ verified: false, reason: "invalid" });
      await expect(anonymous.claimAccess.verifyEmailToken({ token: rawVerificationToken })).resolves.toEqual({ verified: true, reason: "verified" });
      const completion = await anonymous.claimAccess.completeSignUp({ verificationToken: rawVerificationToken, password: "SecurePassword123" });
      expect(completion).toMatchObject({ bowlerId: ownedBowler.insertId, isCapitain: false });
      expect(completion.token).toEqual(expect.any(String));

      const [completed] = await rawQuery<{ codeStatus: string; verificationStatus: string; passwordHash: string | null }>(
        `SELECT c.status AS codeStatus, v.status AS verificationStatus, b.passwordHash
         FROM bowler_claim_codes c
         JOIN bowler_claim_email_verifications v ON v.claimCodeId = c.id
         JOIN bowlers b ON b.id = c.bowlerId
         WHERE c.id = ?`, [claimCode.insertId],
      );
      expect(completed).toMatchObject({ codeStatus: "redeemed", verificationStatus: "consumed" });
      expect(completed?.passwordHash).toEqual(expect.any(String));
      await expect(anonymous.claimAccess.completeSignUp({ verificationToken: rawVerificationToken, password: "AnotherPassword123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      await expect(ownerDirector.claimAccess.paperTickets.createForBowler({ eventId: ownedEvent.insertId, bowlerId: ownedBowler.insertId, note: "Give to captain with shirts" })).resolves.toMatchObject({ success: true });
      const ownTickets = await ownerDirector.claimAccess.paperTickets.listForEvent({ eventId: ownedEvent.insertId });
      expect(ownTickets).toHaveLength(1);
      const admissionPasses = await ownerDirector.claimAccess.admissionPasses.listForEvent({ eventId: ownedEvent.insertId });
      expect(admissionPasses).toHaveLength(1);
      expect(admissionPasses[0]).toMatchObject({ bowlerId: ownedBowler.insertId, firstName: "Verified", lastName: "Bowler", hasPoolPass: true, hasBanquetPass: true });
      expect(admissionPasses[0]).not.toHaveProperty("poolPartyToken");
      expect(admissionPasses[0]).not.toHaveProperty("banquetToken");
      await expect(otherDirector.claimAccess.admissionPasses.listForEvent({ eventId: ownedEvent.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(ownTickets[0]).toMatchObject({ bowlerId: ownedBowler.insertId, status: "requested", hasDigitalPoolPass: true, hasDigitalBanquetPass: true });
      await expect(ownerDirector.claimAccess.paperTickets.createForBowler({ eventId: ownedEvent.insertId, bowlerId: ownedBowler.insertId })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(ownerDirector.claimAccess.paperTickets.listForEvent({ eventId: blockedEvent.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(otherDirector.claimAccess.paperTickets.createForBowler({ eventId: ownedEvent.insertId, bowlerId: ownedBowler.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(appRouter.createCaller(ownerContext()).claimAccess.paperTickets.listForEvent({ eventId: blockedEvent.insertId })).resolves.toEqual([]);

      const ticket = ownTickets[0];
      await expect(ownerDirector.claimAccess.paperTickets.updateStatus({ eventId: ownedEvent.insertId, requestId: ticket.id, status: "ready" })).resolves.toEqual({ success: true });
      await expect(ownerDirector.claimAccess.paperTickets.updateStatus({ eventId: ownedEvent.insertId, requestId: ticket.id, status: "delivered" })).resolves.toEqual({ success: true });
    } finally {
      await rawQuery("DELETE FROM bowler_paper_ticket_requests WHERE eventId IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM bowler_claim_email_verifications WHERE eventId IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM bowler_claim_codes WHERE eventId IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM bowlers WHERE id IN (?, ?)", [ownedBowler.insertId, blockedBowler.insertId]);
      await rawQuery("DELETE FROM events WHERE id IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM ed_staff WHERE id IN (?, ?)", [ownerStaff.insertId, otherStaff.insertId]);
      await rawQuery("DELETE FROM companies WHERE id = ?", [company.insertId]);
    }
  });
});
