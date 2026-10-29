import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("./turnstile", () => ({ verifyTurnstileToken: vi.fn().mockResolvedValue(undefined) }));

import bcrypt from "bcryptjs";
import { appRouter } from "./routers";
import { rawExec, rawQuery } from "./db";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

function ownerContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: ENV.ownerOpenId,
      email: "owner@example.test",
      name: "Platform Owner",
      loginMethod: "test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

function directorContext(staffId: number): TrpcContext {
  const token = jwt.sign(
    { staffId, type: "ed_staff" },
    process.env.JWT_SECRET ?? "fallback-secret",
    { expiresIn: "5m" },
  );
  return {
    user: null,
    req: { protocol: "https", headers: { cookie: `ed_staff_token=${token}` } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const stamp = Date.now();
const originalPassword = "OriginalPassword123";
const replacementPassword = "ReplacementPassword123";
const directorReplacementPassword = "DirectorReplacement123";
let eventId = 0;
let bowlerId = 0;
let claimCodeId = 0;
let legacyBowlerId = 0;
let legacyClaimCodeId = 0;
let unclaimedBowlerId = 0;
let directorId = 0;

describe("bowler password reset", () => {
  beforeAll(async () => {
    const [center] = await rawQuery<{ id: number }>("SELECT id FROM bowling_centers ORDER BY id ASC LIMIT 1");
    const director = await rawExec(
      `INSERT INTO ed_staff (username, passwordHash, name, accessRole)
       VALUES (?, ?, ?, 'event_director')`,
      [`password-reset-director-${stamp}`, "test-hash", "Password Reset Director"],
    );
    directorId = director.insertId;
    const event = await rawExec(
      "INSERT INTO events (createdByStaffId, eventName, eventYear, status) VALUES (?, ?, ?, 'active')",
      [directorId, `Password Reset Test ${stamp}`, 2099],
    );
    eventId = event.insertId;

    const passwordHash = await bcrypt.hash(originalPassword, 12);
    const bowler = await rawExec(
      `INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, passwordHash, registrationStatus)
       VALUES (?, ?, ?, ?, ?, 'signed_up')`,
      [eventId, center.id, "Reset", `Bowler${stamp}`, passwordHash],
    );
    bowlerId = bowler.insertId;

    const claim = await rawExec(
      `INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, redeemedAt, createdAt)
       VALUES (?, ?, ?, 'redeemed', ?, ?)`,
      [eventId, bowlerId, `BOB-R${String(stamp).slice(-5)}`, stamp, stamp],
    );
    claimCodeId = claim.insertId;

    const legacyBowler = await rawExec(
      `INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, registrationStatus)
       VALUES (?, ?, ?, ?, 'pre_registered')`,
      [eventId, center.id, "Legacy", `Reset${stamp}`],
    );
    legacyBowlerId = legacyBowler.insertId;
    const legacyClaim = await rawExec(
      `INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, redeemedAt, createdAt)
       VALUES (?, ?, ?, 'redeemed', ?, ?)`,
      [eventId, legacyBowlerId, `BOB-L${String(stamp).slice(-5)}`, stamp, stamp],
    );
    legacyClaimCodeId = legacyClaim.insertId;

    const unclaimed = await rawExec(
      `INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, registrationStatus)
       VALUES (?, ?, ?, ?, 'pre_registered')`,
      [eventId, center.id, "Unclaimed", `Bowler${stamp}`],
    );
    unclaimedBowlerId = unclaimed.insertId;
  });

  afterAll(async () => {
    await rawExec("DELETE FROM auditLog WHERE targetId IN (?, ?, ?)", [bowlerId, legacyBowlerId, unclaimedBowlerId]);
    await rawExec("DELETE FROM bowler_claim_codes WHERE id IN (?, ?)", [claimCodeId, legacyClaimCodeId]);
    await rawExec("DELETE FROM bowlers WHERE id IN (?, ?, ?)", [bowlerId, legacyBowlerId, unclaimedBowlerId]);
    await rawExec("DELETE FROM events WHERE id = ?", [eventId]);
    await rawExec("DELETE FROM ed_staff WHERE id = ?", [directorId]);
  });

  it("lets both Owner and assigned Event Director replace only the password while preserving the redeemed claim and normal sign-in", async () => {
    const owner = appRouter.createCaller(ownerContext());
    await expect(owner.bowlers.resetPassword({
      id: bowlerId,
      password: replacementPassword,
      actorRole: "Owner",
    })).resolves.toEqual({ success: true });

    const [state] = await rawQuery<{
      passwordHash: string | null;
      registrationStatus: string;
      claimStatus: string;
      redeemedAt: number | null;
    }>(
      `SELECT b.passwordHash, b.registrationStatus, c.status AS claimStatus, c.redeemedAt
       FROM bowlers b
       JOIN bowler_claim_codes c ON c.bowlerId = b.id
       WHERE b.id = ? AND c.id = ?`,
      [bowlerId, claimCodeId],
    );

    expect(state).toMatchObject({ registrationStatus: "signed_up", claimStatus: "redeemed", redeemedAt: stamp });
    expect(state?.passwordHash).toEqual(expect.any(String));
    expect(await bcrypt.compare(replacementPassword, state!.passwordHash!)).toBe(true);
    expect(await bcrypt.compare(originalPassword, state!.passwordHash!)).toBe(false);

    const bowler = appRouter.createCaller(anonymousContext());
    await expect(bowler.bowlerAuth.signIn({
      firstName: "Reset",
      lastName: `Bowler${stamp}`,
      eventId,
      password: replacementPassword,
      turnstileToken: "test-turnstile",
      turnstileAction: "bowler_login",
    })).resolves.toMatchObject({ bowlerId, isCapitain: false, token: expect.any(String) });

    const director = appRouter.createCaller(directorContext(directorId));
    await expect(director.bowlers.resetPassword({
      id: bowlerId,
      password: directorReplacementPassword,
      actorRole: "EventDirector",
    })).resolves.toEqual({ success: true });

    const [directorResetState] = await rawQuery<{
      passwordHash: string | null;
      registrationStatus: string;
      claimStatus: string;
      redeemedAt: number | null;
    }>(
      `SELECT b.passwordHash, b.registrationStatus, c.status AS claimStatus, c.redeemedAt
       FROM bowlers b
       JOIN bowler_claim_codes c ON c.bowlerId = b.id
       WHERE b.id = ? AND c.id = ?`,
      [bowlerId, claimCodeId],
    );
    expect(directorResetState).toMatchObject({ registrationStatus: "signed_up", claimStatus: "redeemed", redeemedAt: stamp });
    expect(await bcrypt.compare(directorReplacementPassword, directorResetState!.passwordHash!)).toBe(true);

    await expect(bowler.bowlerAuth.signIn({
      firstName: "Reset",
      lastName: `Bowler${stamp}`,
      eventId,
      password: directorReplacementPassword,
      turnstileToken: "test-turnstile",
      turnstileAction: "bowler_login",
    })).resolves.toMatchObject({ bowlerId, isCapitain: false, token: expect.any(String) });
  }, 15000);

  it("repairs only a redeemed legacy cleared account and then permits normal sign-in", async () => {
    const owner = appRouter.createCaller(ownerContext());
    await expect(owner.bowlers.resetPassword({
      id: legacyBowlerId,
      password: replacementPassword,
      actorRole: "Owner",
    })).resolves.toEqual({ success: true });

    const [state] = await rawQuery<{
      passwordHash: string | null;
      registrationStatus: string;
      claimStatus: string;
      redeemedAt: number | null;
    }>(
      `SELECT b.passwordHash, b.registrationStatus, c.status AS claimStatus, c.redeemedAt
       FROM bowlers b
       JOIN bowler_claim_codes c ON c.bowlerId = b.id
       WHERE b.id = ? AND c.id = ?`,
      [legacyBowlerId, legacyClaimCodeId],
    );
    expect(state).toMatchObject({ registrationStatus: "signed_up", claimStatus: "redeemed", redeemedAt: stamp });
    expect(await bcrypt.compare(replacementPassword, state!.passwordHash!)).toBe(true);

    const bowler = appRouter.createCaller(anonymousContext());
    await expect(bowler.bowlerAuth.signIn({
      firstName: "Legacy",
      lastName: `Reset${stamp}`,
      eventId,
      password: replacementPassword,
      turnstileToken: "test-turnstile",
      turnstileAction: "bowler_login",
    })).resolves.toMatchObject({ bowlerId: legacyBowlerId, isCapitain: false, token: expect.any(String) });
  }, 15000);

  it("does not let an authorized reset create an account for an unclaimed roster row", async () => {
    const owner = appRouter.createCaller(ownerContext());
    await expect(owner.bowlers.resetPassword({
      id: unclaimedBowlerId,
      password: replacementPassword,
      actorRole: "Owner",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const [state] = await rawQuery<{ passwordHash: string | null; registrationStatus: string }>(
      "SELECT passwordHash, registrationStatus FROM bowlers WHERE id = ?",
      [unclaimedBowlerId],
    );
    expect(state).toEqual({ passwordHash: null, registrationStatus: "pre_registered" });
  }, 15000);
});
