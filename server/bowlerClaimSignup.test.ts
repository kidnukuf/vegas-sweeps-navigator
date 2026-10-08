import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("./turnstile", () => ({ verifyTurnstileToken: vi.fn().mockResolvedValue(undefined) }));
import { appRouter } from "./routers";
import { rawExec, rawQuery } from "./db";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const stamp = Date.now();
const code = `BOB-TEST${String(stamp).slice(-2)}`;
let eventId = 0;
let bowlerId = 0;
let claimCodeId = 0;
let centerId = 0;

describe("direct bowler claim-code sign-up", () => {
  beforeAll(async () => {
    const [center] = await rawQuery<{ id: number }>("SELECT id FROM bowling_centers ORDER BY id ASC LIMIT 1");
    centerId = center.id;
    const event = await rawExec("INSERT INTO events (eventName, eventYear, status) VALUES (?, ?, 'active')", [`Direct Claim Test ${stamp}`, 2099]);
    eventId = event.insertId;
    const bowler = await rawExec(
      `INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, email, phone, registrationStatus)
       VALUES (?, ?, ?, ?, ?, ?, 'pre_registered')`,
      [eventId, centerId, "Direct", `Claim${stamp}`, `direct-${stamp}@example.test`, "7025551212"],
    );
    bowlerId = bowler.insertId;
    const claim = await rawExec(
      "INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, createdAt) VALUES (?, ?, ?, 'unused', ?)",
      [eventId, bowlerId, code, stamp],
    );
    claimCodeId = claim.insertId;
  });

  afterAll(async () => {
    await rawExec("DELETE FROM bowler_claim_codes WHERE id = ?", [claimCodeId]);
    await rawExec("DELETE FROM bowlers WHERE id = ?", [bowlerId]);
    await rawExec("DELETE FROM events WHERE id = ?", [eventId]);
  });

  it("accepts the roster phone with formatting differences and redeems the code once", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    const result = await caller.bowlerAuth.signUp({
      firstName: "Direct",
      lastName: `Claim${stamp}`,
      eventId,
      centerId,
      password: "SecurePassword123",
      phone: "(702) 555-1212",
      claimCode: code.toLowerCase(),
      turnstileToken: "test-turnstile",
    });
    expect(result).toMatchObject({ bowlerId, isCapitain: false });
    expect(result.token).toEqual(expect.any(String));

    const [state] = await rawQuery<{ status: string; registrationStatus: string; passwordHash: string | null }>(
      `SELECT c.status, b.registrationStatus, b.passwordHash
       FROM bowler_claim_codes c JOIN bowlers b ON b.id = c.bowlerId WHERE c.id = ?`,
      [claimCodeId],
    );
    expect(state).toMatchObject({ status: "redeemed", registrationStatus: "signed_up" });
    expect(state?.passwordHash).toEqual(expect.any(String));
  }, 15000);

  it("does not allow a mismatched email or phone to redeem a claim code", async () => {
    const secondEvent = await rawExec("INSERT INTO events (eventName, eventYear, status) VALUES (?, ?, 'active')", [`Direct Claim Mismatch ${stamp}`, 2099]);
    const secondBowler = await rawExec(
      `INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, email, phone, registrationStatus)
       VALUES (?, ?, ?, ?, ?, ?, 'pre_registered')`,
      [secondEvent.insertId, centerId, "Mismatch", `Claim${stamp}`, `mismatch-${stamp}@example.test`, "7025553434"],
    );
    const secondClaim = await rawExec(
      "INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, createdAt) VALUES (?, ?, ?, 'unused', ?)",
      [secondEvent.insertId, secondBowler.insertId, `BOB-M${String(stamp).slice(-3)}`, stamp],
    );
    try {
      const caller = appRouter.createCaller(anonymousContext());
      await expect(caller.bowlerAuth.signUp({
        firstName: "Mismatch",
        lastName: `Claim${stamp}`,
        eventId: secondEvent.insertId,
        centerId,
        password: "SecurePassword123",
        email: "wrong@example.test",
        claimCode: `BOB-M${String(stamp).slice(-3)}`,
        turnstileToken: "test-turnstile",
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [state] = await rawQuery<{ status: string; passwordHash: string | null }>(
        "SELECT c.status, b.passwordHash FROM bowler_claim_codes c JOIN bowlers b ON b.id = c.bowlerId WHERE c.id = ?",
        [secondClaim.insertId],
      );
      expect(state).toMatchObject({ status: "unused", passwordHash: null });
    } finally {
      await rawExec("DELETE FROM bowler_claim_codes WHERE id = ?", [secondClaim.insertId]);
      await rawExec("DELETE FROM bowlers WHERE id = ?", [secondBowler.insertId]);
      await rawExec("DELETE FROM events WHERE id = ?", [secondEvent.insertId]);
    }
  }, 15000);
});
