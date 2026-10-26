import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  rawExec: vi.fn(),
  withDbTransaction: vi.fn(),
  verifyTurnstileToken: vi.fn().mockResolvedValue(undefined),
  notifyED: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => ({
  rawQuery: mocks.rawQuery,
  rawExec: mocks.rawExec,
  withDbTransaction: mocks.withDbTransaction,
  updateBowler: vi.fn(),
  upsertHotelRecord: vi.fn(),
  upsertPaymentRecord: vi.fn(),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getEventSheetTarget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./turnstile", () => ({ verifyTurnstileToken: mocks.verifyTurnstileToken }));
vi.mock("./notifyED", () => ({ notifyED: mocks.notifyED }));
vi.mock("./googleSheets", () => ({
  writeQRCodesToSheet: vi.fn().mockResolvedValue(undefined),
  writeContactInfoToSheet: vi.fn().mockResolvedValue(undefined),
  writeScanUsedToSheet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./_core/edAuth", () => ({
  assertBowlerAccess: vi.fn().mockResolvedValue({ type: "owner", userId: 1 }),
  assertEventAccess: vi.fn().mockResolvedValue({ type: "owner", userId: 1 }),
  resolveEdSession: vi.fn().mockResolvedValue({ type: "owner", userId: 1 }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:qr") } }));

import { bowlerAuthRouter } from "./routers/bowlerAuth";

const NOVEMBER_EVENT_ID = 3960003;
const STANDARD_EVENT_ID = 3960999;

type RosterBowler = {
  id: number;
  eventId: number;
  legalFirstName: string;
  legalLastName: string;
  centerId: number;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  registrationStatus: string;
  isCapitain: number;
  captainVerified?: number;
  scantronId?: string | null;
  guestPoolPartyAmount?: string | null;
  poolPartyToken?: string | null;
  banquetToken?: string | null;
};

type ClaimCode = {
  id: number;
  eventId: number;
  bowlerId: number;
  code: string;
  status: string;
};

type MockState = {
  bowlers: RosterBowler[];
  codes: ClaimCode[];
  bowlerUpdateCalls: Array<{ sql: string; params: unknown[] }>;
  guestTokenInserts: Array<{ bowlerId: number; suffix: string; token: string }>;
  forceAccountUpdateFailure?: boolean;
  forceClaimRedemptionFailure?: boolean;
};

type MockConnection = {
  execute: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
};

function caller() {
  return bowlerAuthRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: { "cf-connecting-ip": "203.0.113.10" } },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext);
}

function rosterBowler(overrides: Partial<RosterBowler> = {}): RosterBowler {
  return {
    id: 100,
    eventId: STANDARD_EVENT_ID,
    legalFirstName: "Roster",
    legalLastName: "Bowler",
    centerId: 10,
    email: "roster@example.test",
    phone: "7025551212",
    passwordHash: null,
    registrationStatus: "pre_registered",
    isCapitain: 0,
    captainVerified: 0,
    scantronId: "0000000100",
    guestPoolPartyAmount: "0",
    poolPartyToken: null,
    banquetToken: "EXISTING-BANQUET",
    ...overrides,
  };
}

function makeState(): MockState {
  const bowlers = [
    rosterBowler({
      id: 101,
      eventId: NOVEMBER_EVENT_ID,
      legalFirstName: "Email",
      legalLastName: "November",
      centerId: 11,
      email: "email.roster@example.test",
      phone: "7025551001",
      poolPartyToken: "STALE-NOVEMBER-POOL",
    }),
    rosterBowler({
      id: 102,
      legalFirstName: "Phone",
      legalLastName: "Normalized",
      centerId: 12,
      email: null,
      phone: "7025551212",
    }),
    rosterBowler({
      id: 103,
      legalFirstName: "Captain",
      legalLastName: "Claim",
      centerId: 13,
      email: "captain@example.test",
      phone: "7025551313",
      isCapitain: 1,
    }),
    rosterBowler({ id: 104, legalFirstName: "Void", legalLastName: "Code", centerId: 14 }),
    rosterBowler({ id: 105, legalFirstName: "Redeemed", legalLastName: "Code", centerId: 15 }),
    rosterBowler({ id: 106, legalFirstName: "Name", legalLastName: "Owner", centerId: 16 }),
    rosterBowler({ id: 107, legalFirstName: "Center", legalLastName: "Owner", centerId: 17 }),
    rosterBowler({ id: 108, legalFirstName: "Contact", legalLastName: "Owner", centerId: 18 }),
    rosterBowler({
      id: 109,
      legalFirstName: "Claim",
      legalLastName: "Normalize",
      centerId: 19,
      email: null,
      phone: "7025551919",
    }),
    rosterBowler({
      id: 110,
      legalFirstName: "Empty",
      legalLastName: "Digits",
      centerId: 20,
      email: null,
      phone: "?",
    }),
  ];
  const codeFor = (id: number, code: string, status = "unused"): ClaimCode => ({
    id: id + 1000,
    eventId: bowlers.find((bowler) => bowler.id === id)!.eventId,
    bowlerId: id,
    code,
    status,
  });

  return {
    bowlers,
    codes: [
      codeFor(101, "EMAIL-NOVEMBER"),
      codeFor(102, "PHONE-NORMALIZED"),
      codeFor(103, "CAPTAIN-SIGNUP"),
      codeFor(104, "VOID-CODE", "void"),
      codeFor(105, "REDEEMED-CODE", "redeemed"),
      codeFor(106, "NAME-MISMATCH"),
      codeFor(107, "CENTER-MISMATCH"),
      codeFor(108, "CONTACT-MISMATCH"),
      codeFor(109, "ABC-1234"),
      codeFor(110, "EMPTY-DIGITS"),
    ],
    bowlerUpdateCalls: [],
    guestTokenInserts: [],
  };
}

function installDatabaseMock(state: MockState) {
  mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM bowlers b") && sql.includes("LOWER(TRIM(b.legalFirstName))")) {
      const [eventId, firstName, lastName, centerId, claimedBowlerId] = params as [number, string, string, number, number?];
      const bowler = state.bowlers.find((candidate) =>
        candidate.eventId === eventId
        && candidate.legalFirstName.toLowerCase() === firstName.trim().toLowerCase()
        && candidate.legalLastName.toLowerCase() === lastName.trim().toLowerCase()
        && candidate.centerId === centerId
        && (claimedBowlerId === undefined || candidate.id === claimedBowlerId),
      );
      if (!bowler) return [];
      return [{
        ...bowler,
        preferredName: null,
        teamId: null,
        teamName: null,
        centerName: `Center ${bowler.centerId}`,
        laneNumber: null,
        squadTime: null,
      }];
    }

    if (sql.includes("SELECT COUNT(*) AS c FROM bowler_claim_codes")) {
      const eventId = params[0] as number;
      return [{ c: state.codes.filter((code) => code.eventId === eventId).length }];
    }

    if (sql.includes("FROM bowler_claim_codes c") && sql.includes("WHERE c.eventId = ? AND c.code = ?")) {
      const [eventId, codeValue] = params as [number, string];
      const code = state.codes.find((candidate) => candidate.eventId === eventId && candidate.code === codeValue);
      const bowler = code && state.bowlers.find((candidate) => candidate.id === code.bowlerId);
      if (!code || !bowler) return [];
      return [{
        id: code.id,
        bowlerId: code.bowlerId,
        status: code.status,
        legalFirstName: bowler.legalFirstName,
        legalLastName: bowler.legalLastName,
        centerId: bowler.centerId,
        rosterEmail: bowler.email,
        rosterPhone: bowler.phone,
      }];
    }

    throw new Error(`Unexpected rawQuery in claim redemption test: ${sql}`);
  });

  mocks.rawExec.mockImplementation(async (sql: string) => {
    throw new Error(`Unexpected rawExec in claim redemption test: ${sql}`);
  });

  mocks.withDbTransaction.mockImplementation(async (work: (connection: MockConnection) => Promise<unknown>) => {
    // Transaction-local copies make a failed callback a true rollback in this
    // mock: no account, guest-token, or claim-code mutation reaches state.
    const bowlers = state.bowlers.map((bowler) => ({ ...bowler }));
    const codes = state.codes.map((code) => ({ ...code }));
    const bowlerUpdateCalls: Array<{ sql: string; params: unknown[] }> = [];
    const guestTokenInserts: Array<{ bowlerId: number; suffix: string; token: string }> = [];

    const connection: MockConnection = {
      execute: async (sql: string, params: unknown[] = []): Promise<[unknown, unknown]> => {
        if (sql.includes("SELECT poolPartyToken, banquetToken FROM bowlers WHERE id = ?")) {
          const bowler = bowlers.find((candidate) => candidate.id === params[0]);
          return [bowler ? [{ poolPartyToken: bowler.poolPartyToken ?? null, banquetToken: bowler.banquetToken ?? null }] : [], undefined];
        }

        if (sql.startsWith("UPDATE bowlers SET ")) {
          const bowlerId = params.at(-1) as number;
          const bowler = bowlers.find((candidate) => candidate.id === bowlerId);
          if (state.forceAccountUpdateFailure || !bowler || (bowler.passwordHash !== null && bowler.passwordHash !== "")) {
            return [{ affectedRows: 0 }, undefined];
          }
          bowlerUpdateCalls.push({ sql, params: [...params] });
          bowler.passwordHash = params[0] as string;
          bowler.registrationStatus = "signed_up";
          if (sql.includes("captainVerified = 1")) bowler.captainVerified = 1;
          if (sql.includes("poolPartyToken = NULL")) bowler.poolPartyToken = null;
          return [{ affectedRows: 1 }, undefined];
        }

        if (sql.includes("SELECT suffix, token FROM guest_pool_party_tokens")) return [[], undefined];

        if (sql.includes("INSERT INTO guest_pool_party_tokens")) {
          guestTokenInserts.push({ bowlerId: params[0] as number, suffix: params[1] as string, token: params[2] as string });
          return [{ affectedRows: 1 }, undefined];
        }

        if (sql.includes("UPDATE bowler_claim_codes SET status = 'redeemed'")) {
          const codeId = params[2] as number;
          const code = codes.find((candidate) => candidate.id === codeId);
          if (state.forceClaimRedemptionFailure || !code || code.status !== "unused") {
            return [{ affectedRows: 0 }, undefined];
          }
          code.status = "redeemed";
          return [{ affectedRows: 1 }, undefined];
        }

        throw new Error(`Unexpected transactional execute in claim redemption test: ${sql}`);
      },
    };

    const result = await work(connection);
    for (const bowler of bowlers) {
      Object.assign(state.bowlers.find((candidate) => candidate.id === bowler.id)!, bowler);
    }
    for (const code of codes) {
      Object.assign(state.codes.find((candidate) => candidate.id === code.id)!, code);
    }
    state.bowlerUpdateCalls.push(...bowlerUpdateCalls);
    state.guestTokenInserts.push(...guestTokenInserts);
    return result;
  });
}

function signUpInput(code: string, overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Roster",
    lastName: "Bowler",
    eventId: STANDARD_EVENT_ID,
    centerId: 10,
    password: "SecurePassword123",
    claimCode: code,
    turnstileToken: "mock-turnstile-token",
    turnstileAction: "bowler_signup" as const,
    ...overrides,
  };
}

function updateStatements(state: MockState) {
  return state.bowlerUpdateCalls;
}

describe("claim-code redemption sign-up (mocked database)", () => {
  let state: MockState;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
    mocks.notifyED.mockResolvedValue(undefined);
    state = makeState();
    installDatabaseMock(state);
  });

  it("redeems a valid roster-email claim once, clears November pool credentials, and never creates a pool token", async () => {
    const result = await caller().signUp(signUpInput("email-november", {
      firstName: "Email",
      lastName: "November",
      eventId: NOVEMBER_EVENT_ID,
      centerId: 11,
      email: "EMAIL.ROSTER@example.test",
    }));

    expect(result).toMatchObject({ bowlerId: 101, isCapitain: false, token: expect.any(String) });
    expect(state.codes.find((code) => code.code === "EMAIL-NOVEMBER")?.status).toBe("redeemed");
    expect(mocks.withDbTransaction).toHaveBeenCalledTimes(1);

    const [update] = updateStatements(state);
    expect(update?.sql).toContain("poolPartyToken = NULL");
    expect(update?.sql).not.toContain("poolPartyToken = ?");
    expect(update?.sql).toContain("passwordHash IS NULL OR passwordHash = ''");
    expect(update?.params).toEqual(expect.arrayContaining(["EXISTING-BANQUET", 101]));
    expect(state.guestTokenInserts).toEqual([]);
  });

  it("accepts normalized roster-phone contact and refuses a second redemption", async () => {
    const input = signUpInput("phone-normalized", {
      firstName: "Phone",
      lastName: "Normalized",
      centerId: 12,
      phone: "(702) 555-1212",
    });

    await expect(caller().signUp(input)).resolves.toMatchObject({ bowlerId: 102 });
    await expect(caller().signUp(input)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("already been used"),
    });

    expect(state.codes.find((code) => code.code === "PHONE-NORMALIZED")?.status).toBe("redeemed");
    expect(updateStatements(state)).toHaveLength(1);
    expect(mocks.withDbTransaction).toHaveBeenCalledTimes(1);
  });

  it("normalizes an undashed recognized claim code for lookup", async () => {
    await expect(caller().signUp(signUpInput("abc1234", {
      firstName: "Claim",
      lastName: "Normalize",
      centerId: 19,
      phone: "7025551919",
    }))).resolves.toMatchObject({ bowlerId: 109 });

    expect(state.codes.find((code) => code.code === "ABC-1234")?.status).toBe("redeemed");
  });

  it("does not accept non-digit values that both normalize to an empty phone", async () => {
    await expect(caller().signUp(signUpInput("EMPTY-DIGITS", {
      firstName: "Empty",
      lastName: "Digits",
      centerId: 20,
      phone: "abc",
    }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("email or phone does not match"),
    });

    expect(state.bowlers.find((bowler) => bowler.id === 110)?.passwordHash).toBeNull();
    expect(state.codes.find((code) => code.code === "EMPTY-DIGITS")?.status).toBe("unused");
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });

  it("accepts the captain signup action and marks the captain verified", async () => {
    const result = await caller().signUp(signUpInput("CAPTAIN-SIGNUP", {
      firstName: "Captain",
      lastName: "Claim",
      centerId: 13,
      email: "captain@example.test",
      turnstileAction: "captain_signup",
    }));

    expect(result).toMatchObject({ bowlerId: 103, isCapitain: true });
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      "mock-turnstile-token",
      "203.0.113.10",
      "captain_signup",
    );
    expect(updateStatements(state)[0]?.sql).toContain("captainVerified = 1");
    expect(state.bowlers.find((bowler) => bowler.id === 103)?.captainVerified).toBe(1);
    expect(state.codes.find((code) => code.code === "CAPTAIN-SIGNUP")?.status).toBe("redeemed");
  });

  it.each([
    ["unknown", "NOT-A-REAL-CODE", "BAD_REQUEST"],
    ["void", "VOID-CODE", "CONFLICT"],
    ["already redeemed", "REDEEMED-CODE", "CONFLICT"],
  ])("rejects a %s code before account or redemption updates", async (_label, claimCode, expectedCode) => {
    const code = state.codes.find((candidate) => candidate.code === claimCode);
    const bowler = code && state.bowlers.find((candidate) => candidate.id === code.bowlerId);
    const initialStatus = code?.status;

    await expect(caller().signUp(signUpInput(claimCode, {
      firstName: bowler?.legalFirstName ?? "Roster",
      lastName: bowler?.legalLastName ?? "Bowler",
      eventId: bowler?.eventId ?? STANDARD_EVENT_ID,
      centerId: bowler?.centerId ?? 10,
      email: bowler?.email ?? "roster@example.test",
      phone: bowler?.phone ?? undefined,
    }))).rejects.toMatchObject({ code: expectedCode });

    expect(updateStatements(state)).toHaveLength(0);
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
    expect(code?.status).toBe(initialStatus);
    expect(state.bowlers.every((candidate) => candidate.passwordHash === null)).toBe(true);
  });

  it.each([
    ["name", "NAME-MISMATCH", { firstName: "Wrong", lastName: "Name", centerId: 16, email: "roster@example.test" }],
    ["center", "CENTER-MISMATCH", { firstName: "Center", lastName: "Owner", centerId: 999, email: "roster@example.test" }],
    ["contact", "CONTACT-MISMATCH", { firstName: "Contact", lastName: "Owner", centerId: 18, email: "wrong@example.test", phone: "7025559999" }],
  ])("does not update a password or redeem on %s mismatch", async (_label, claimCode, overrides) => {
    const code = state.codes.find((candidate) => candidate.code === claimCode)!;
    const bowler = state.bowlers.find((candidate) => candidate.id === code.bowlerId)!;

    await expect(caller().signUp(signUpInput(claimCode, {
      ...overrides,
      eventId: bowler.eventId,
    }))).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(bowler.passwordHash).toBeNull();
    expect(code.status).toBe("unused");
    expect(updateStatements(state)).toHaveLength(0);
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });

  it("does not overwrite an account or redeem a claim when a concurrent account update wins", async () => {
    const bowler = state.bowlers.find((candidate) => candidate.id === 102)!;
    state.forceAccountUpdateFailure = true;

    await expect(caller().signUp(signUpInput("PHONE-NORMALIZED", {
      firstName: "Phone",
      lastName: "Normalized",
      centerId: 12,
      phone: "7025551212",
    }))).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("account already exists"),
    });

    expect(mocks.withDbTransaction).toHaveBeenCalledTimes(1);
    expect(bowler.passwordHash).toBeNull();
    expect(state.codes.find((code) => code.code === "PHONE-NORMALIZED")?.status).toBe("unused");
    expect(updateStatements(state)).toEqual([]);
    expect(state.guestTokenInserts).toEqual([]);
  });

  it("rolls back account and fallback guest-token writes when a raced claim redemption loses", async () => {
    const bowler = state.bowlers.find((candidate) => candidate.id === 102)!;
    bowler.guestPoolPartyAmount = "15";
    state.forceClaimRedemptionFailure = true;

    await expect(caller().signUp(signUpInput("PHONE-NORMALIZED", {
      firstName: "Phone",
      lastName: "Normalized",
      centerId: 12,
      phone: "7025551212",
    }))).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("already been used"),
    });

    expect(mocks.withDbTransaction).toHaveBeenCalledTimes(1);
    expect(bowler.passwordHash).toBeNull();
    expect(bowler.registrationStatus).toBe("pre_registered");
    expect(state.codes.find((code) => code.code === "PHONE-NORMALIZED")?.status).toBe("unused");
    expect(updateStatements(state)).toEqual([]);
    expect(state.guestTokenInserts).toEqual([]);
  });
});
