/**
 * Tests for the claim-code router (fall-season sign-up security).
 *
 * Verifies, against the live DB with a throwaway event + bowlers:
 *  - generateForEvent mints exactly one unused code per bowler that lacks one,
 *    is idempotent (re-running creates 0 new), and produces BOB-XXXX codes,
 *  - listForEvent returns the expected joined shape,
 *  - lookup finds a row by exact code AND by partial name,
 *  - reissue voids the old code and mints a fresh unused one for the same bowler,
 *  - the sign-up enforcement contract holds (a redeemed/void code is not "unused",
 *    and a code belongs to exactly one bowler).
 *
 * All rows are namespaced to a throwaway event and cleaned up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { rawQuery, rawExec } from "./db";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const caller = appRouter.createCaller(createCtx());

let EVENT_ID = 0;
let BOWLER_A = 0;
let BOWLER_B = 0;
const TAG = `CCTEST${Date.now()}`;
const CODE_RE = /^BOB-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

describe("claimCodes router", () => {
  beforeAll(async () => {
    const ev = await rawExec(
      "INSERT INTO events (eventName, eventYear) VALUES (?, 2099)",
      [`Claim Test ${TAG}`]
    );
    EVENT_ID = ev.insertId;

    const a = await rawExec(
      "INSERT INTO bowlers (legalFirstName, legalLastName, eventId, registrationStatus) VALUES (?, ?, ?, 'pre_registered')",
      ["Alice", `${TAG}A`, EVENT_ID]
    );
    BOWLER_A = a.insertId;
    const b = await rawExec(
      "INSERT INTO bowlers (legalFirstName, legalLastName, eventId, registrationStatus) VALUES (?, ?, ?, 'pre_registered')",
      ["Bob", `${TAG}B`, EVENT_ID]
    );
    BOWLER_B = b.insertId;
  });

  afterAll(async () => {
    await rawQuery("DELETE FROM bowler_claim_codes WHERE eventId = ?", [EVENT_ID]);
    await rawQuery("DELETE FROM bowlers WHERE eventId = ?", [EVENT_ID]);
    await rawQuery("DELETE FROM events WHERE id = ?", [EVENT_ID]);
  });

  it("generateForEvent mints one BOB-XXXX code per bowler and is idempotent", async () => {
    const first = await caller.claimCodes.generateForEvent({ eventId: EVENT_ID });
    expect(first.created).toBe(2);
    expect(first.totalForEvent).toBe(2);

    // Re-running must NOT create duplicates (both bowlers already have a code).
    const second = await caller.claimCodes.generateForEvent({ eventId: EVENT_ID });
    expect(second.created).toBe(0);
    expect(second.totalForEvent).toBe(2);

    const rows = await rawQuery<{ code: string; bowlerId: number; status: string }>(
      "SELECT code, bowlerId, status FROM bowler_claim_codes WHERE eventId = ?",
      [EVENT_ID]
    );
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.code).toMatch(CODE_RE);
      expect(r.status).toBe("unused");
    }
    // Codes are unique to each bowler.
    expect(new Set(rows.map((r) => r.code)).size).toBe(2);
    expect(new Set(rows.map((r) => r.bowlerId)).size).toBe(2);
  });

  it("listForEvent returns the joined bowler+code shape", async () => {
    const list = await caller.claimCodes.listForEvent({ eventId: EVENT_ID });
    expect(list.length).toBe(2);
    const alice = list.find((r) => r.lastName === `${TAG}A`);
    expect(alice).toBeTruthy();
    expect(alice?.firstName).toBe("Alice");
    expect(alice?.bowlerId).toBe(BOWLER_A);
    expect(alice?.code).toMatch(CODE_RE);
    expect(alice?.status).toBe("unused");
  });

  it("lookup finds a row by exact code and by partial name", async () => {
    const list = await caller.claimCodes.listForEvent({ eventId: EVENT_ID });
    const aliceCode = list.find((r) => r.lastName === `${TAG}A`)!.code;

    const byCode = await caller.claimCodes.lookup({ eventId: EVENT_ID, query: aliceCode });
    expect(byCode.length).toBe(1);
    expect(byCode[0]?.bowlerId).toBe(BOWLER_A);

    // Lowercase code still resolves (procedure upper-cases the query).
    const byCodeLower = await caller.claimCodes.lookup({
      eventId: EVENT_ID,
      query: aliceCode.toLowerCase(),
    });
    expect(byCodeLower.length).toBe(1);

    const byName = await caller.claimCodes.lookup({ eventId: EVENT_ID, query: `${TAG}B` });
    expect(byName.length).toBe(1);
    expect(byName[0]?.bowlerId).toBe(BOWLER_B);
  });

  it("reissue voids the old code and mints a fresh unused one for the same bowler", async () => {
    const list = await caller.claimCodes.listForEvent({ eventId: EVENT_ID });
    const alice = list.find((r) => r.lastName === `${TAG}A`)!;

    const res = await caller.claimCodes.reissue({ eventId: EVENT_ID, codeId: alice.codeId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.newCode).toMatch(CODE_RE);
    expect(res.newCode).not.toBe(alice.code);

    // Old code is now void.
    const old = await rawQuery<{ status: string }>(
      "SELECT status FROM bowler_claim_codes WHERE id = ?",
      [alice.codeId]
    );
    expect(old[0]?.status).toBe("void");

    // The new code is unused, belongs to Alice, and links back to the voided one.
    const fresh = await rawQuery<{ status: string; bowlerId: number; reissuedFromId: number }>(
      "SELECT status, bowlerId, reissuedFromId FROM bowler_claim_codes WHERE code = ?",
      [res.newCode]
    );
    expect(fresh[0]?.status).toBe("unused");
    expect(fresh[0]?.bowlerId).toBe(BOWLER_A);
    expect(fresh[0]?.reissuedFromId).toBe(alice.codeId);

    // reissue on a non-existent code returns ok:false.
    const missing = await caller.claimCodes.reissue({ eventId: EVENT_ID, codeId: 0 });
    expect(missing.ok).toBe(false);
  });

  it("upholds the sign-up enforcement contract (code state + ownership)", async () => {
    // After reissue, Alice has exactly one redeemable (unused) code.
    const aliceCodes = await rawQuery<{ id: number; status: string; bowlerId: number }>(
      "SELECT id, status, bowlerId FROM bowler_claim_codes WHERE eventId = ? AND bowlerId = ?",
      [EVENT_ID, BOWLER_A]
    );
    const unused = aliceCodes.filter((c) => c.status === "unused");
    const voided = aliceCodes.filter((c) => c.status === "void");
    expect(unused.length).toBe(1);
    expect(voided.length).toBe(1);

    // Simulate redemption exactly as signUp does (guarded on status='unused').
    const redeem = await rawExec(
      "UPDATE bowler_claim_codes SET status = 'redeemed', redeemedAt = ? WHERE id = ? AND status = 'unused'",
      [Date.now(), unused[0].id]
    );
    expect(redeem.affectedRows).toBe(1);

    // A second redemption of the same code must NOT succeed (one-time use).
    const second = await rawExec(
      "UPDATE bowler_claim_codes SET status = 'redeemed' WHERE id = ? AND status = 'unused'",
      [unused[0].id]
    );
    expect(second.affectedRows).toBe(0);

    // Every code in the event still maps to exactly one bowler (no cross-ownership).
    const all = await rawQuery<{ code: string; bowlerId: number }>(
      "SELECT code, bowlerId FROM bowler_claim_codes WHERE eventId = ?",
      [EVENT_ID]
    );
    const byCode = new Map<string, Set<number>>();
    for (const r of all) {
      if (!byCode.has(r.code)) byCode.set(r.code, new Set());
      byCode.get(r.code)!.add(r.bowlerId);
    }
    for (const owners of byCode.values()) expect(owners.size).toBe(1);
  });
});
