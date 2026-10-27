import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  rawExec: vi.fn(),
  withDbTransaction: vi.fn(),
  assertBowlerAccess: vi.fn(),
  assertEventAccess: vi.fn(),
  resolveEdSession: vi.fn(),
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
vi.mock("./_core/edAuth", () => ({
  assertBowlerAccess: mocks.assertBowlerAccess,
  assertEventAccess: mocks.assertEventAccess,
  resolveEdSession: mocks.resolveEdSession,
}));
vi.mock("./notifyED", () => ({
  notifyED: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./googleSheets", () => ({
  writeQRCodesToSheet: vi.fn().mockResolvedValue(undefined),
  writeContactInfoToSheet: vi.fn().mockResolvedValue(undefined),
  writeScanUsedToSheet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./turnstile", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:qr") },
}));

import { bowlerAuthRouter } from "./routers/bowlerAuth";

const EVENT_ID = 3960999;
const NOVEMBER_EVENT_ID = 3960003;

function caller() {
  return bowlerAuthRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext);
}

function directorToken() {
  return jwt.sign(
    { role: "EventDirector" },
    process.env.JWT_SECRET ?? "dev-secret",
    { expiresIn: "1h" }
  );
}

function rosterRows() {
  const base = {
    centerId: 8,
    centerName: "Alpha Bowl",
    teamId: 22,
    teamName: "Exact Team Name",
    teamCode: "02",
    leagueId: 12,
    leagueName: "Exact League Name",
    leagueCode: "07",
    isCapitain: 1,
    under21: 0,
    poolPartyEnabled: 1,
  };
  return {
    bowlers: [
      {
        ...base,
        id: 101,
        legalFirstName: "Ada",
        legalLastName: "Captain",
        poolPartyToken: "captain pool /1",
        poolPartyUsed: 0,
        banquetToken: "captain banquet /1",
        banquetUsed: 1,
      },
      {
        ...base,
        id: 102,
        legalFirstName: "No",
        legalLastName: "Token",
        isCapitain: 0,
        poolPartyToken: null,
        poolPartyUsed: 0,
        banquetToken: null,
        banquetUsed: 0,
      },
    ],
    guests: [
      {
        ...base,
        id: 901,
        bowlerId: 101,
        legalFirstName: "Ada",
        legalLastName: "Captain",
        guestName: "  Named Guest  ",
        suffix: "A",
        token: "guest pool /A",
        used: 0,
        banquetToken: "guest banquet /A",
        banquetUsed: 1,
        disabled: 0,
      },
      {
        ...base,
        id: 902,
        bowlerId: 101,
        legalFirstName: "Ada",
        legalLastName: "Captain",
        guestName: null,
        suffix: "B",
        token: null,
        used: 0,
        banquetToken: "guest banquet /B",
        banquetUsed: 0,
        disabled: 0,
      },
      {
        ...base,
        id: 903,
        bowlerId: 101,
        legalFirstName: "Ada",
        legalLastName: "Captain",
        guestName: "Disabled Guest",
        suffix: "C",
        token: "disabled pool",
        used: 0,
        banquetToken: "disabled banquet",
        banquetUsed: 0,
        disabled: 1,
      },
      {
        ...base,
        id: 904,
        bowlerId: 101,
        legalFirstName: "Ada",
        legalLastName: "Captain",
        guestName: "Banquet-only Placeholder",
        suffix: "D",
        token: "placeholder-BQ",
        used: 0,
        banquetToken: null,
        banquetUsed: 0,
        disabled: 0,
      },
    ],
  };
}

function installReadOnlyRosterMock() {
  const rows = rosterRows();
  mocks.rawQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT DISTINCT b.centerId AS id")) return [];
    if (sql.includes("SELECT DISTINCT b.teamId AS id")) return [];
    if (sql.includes("FROM guest_pool_party_tokens g")) return rows.guests;
    if (sql.includes("FROM bowlers b") && sql.includes("INNER JOIN events e"))
      return rows.bowlers;
    throw new Error(`Unexpected query in master print roster test: ${sql}`);
  });
}

function mutationStatements() {
  return mocks.rawQuery.mock.calls
    .map(([sql]) => String(sql))
    .filter(sql =>
      /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b/i.test(sql)
    );
}

describe("getQrBusinessCardRoster master print", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertEventAccess.mockResolvedValue({ type: "owner", userId: 1 });
    mocks.assertBowlerAccess.mockResolvedValue({ type: "owner", userId: 1 });
    mocks.resolveEdSession.mockResolvedValue({ type: "owner", userId: 1 });
    installReadOnlyRosterMock();
  });

  it("uses the exact stored credential in each canonical URL namespace and normal mode excludes used, missing, disabled, and pool-placeholder passes", async () => {
    const result = await caller().getQrBusinessCardRoster({
      token: directorToken(),
      eventId: EVENT_ID,
    });

    expect(result.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "bowler-101-pool",
          qrUrl: "https://www.bowlvegas.com/scan/pool/captain%20pool%20%2F1",
          used: false,
        }),
        expect.objectContaining({
          cardId: "guest-901-pool",
          qrUrl:
            "https://www.bowlvegas.com/scan/guest-pool/guest%20pool%20%2FA",
          used: false,
        }),
        expect.objectContaining({
          cardId: "guest-902-banquet",
          qrUrl:
            "https://www.bowlvegas.com/scan/guest-banquet/guest%20banquet%20%2FB",
          used: false,
        }),
      ])
    );
    expect(result.cards.map(card => card.cardId).sort()).toEqual([
      "bowler-101-pool",
      "guest-901-pool",
      "guest-902-banquet",
    ]);
    expect(
      result.cards.every(card =>
        card.qrUrl.startsWith("https://www.bowlvegas.com/scan/")
      )
    ).toBe(true);
    expect(
      result.cards.some(
        card => card.qrUrl.includes("undefined") || card.qrUrl.includes("null")
      )
    ).toBe(false);
    expect(
      result.cards.some(
        card => card.cardId.includes("903") || card.cardId.includes("904")
      )
    ).toBe(false);

    // All fields consumed by the master PDF are returned for both attendee types.
    const bowlerCard = result.cards.find(
      card => card.cardId === "bowler-101-pool"
    );
    const guestCard = result.cards.find(
      card => card.cardId === "guest-901-pool"
    );
    expect(bowlerCard).toMatchObject({
      leagueId: 12,
      leagueName: "Exact League Name",
      leagueCode: "07",
      teamCode: "02",
      isCaptain: true,
      used: false,
      guestSuffix: null,
    });
    expect(guestCard).toMatchObject({
      leagueId: 12,
      leagueName: "Exact League Name",
      leagueCode: "07",
      teamCode: "02",
      isCaptain: true,
      used: false,
      guestSuffix: "A",
      attendeeName: "  Named Guest  ",
      hostName: "Ada Captain",
    });
  });

  it("master mode emits stored redeemed credentials with used metadata, preserves names, and labels unnamed guests as Guest Pass suffix", async () => {
    const result = await caller().getQrBusinessCardRoster({
      token: directorToken(),
      eventId: EVENT_ID,
      masterPrint: true,
    });

    expect(result.cards.map(card => card.cardId).sort()).toEqual([
      "bowler-101-banquet",
      "bowler-101-pool",
      "guest-901-banquet",
      "guest-901-pool",
      "guest-902-banquet",
    ]);
    expect(
      result.cards.find(card => card.cardId === "bowler-101-banquet")
    ).toMatchObject({
      qrUrl: "https://www.bowlvegas.com/scan/banquet/captain%20banquet%20%2F1",
      used: true,
      isCaptain: true,
      guestSuffix: null,
    });
    expect(
      result.cards.find(card => card.cardId === "guest-901-banquet")
    ).toMatchObject({
      qrUrl:
        "https://www.bowlvegas.com/scan/guest-banquet/guest%20banquet%20%2FA",
      used: true,
      attendeeName: "  Named Guest  ",
      hostName: "Ada Captain",
      guestSuffix: "A",
    });
    expect(
      result.cards.find(card => card.cardId === "guest-902-banquet")
    ).toMatchObject({
      attendeeName: "Guest Pass B",
      hostName: "Ada Captain",
      used: false,
      guestSuffix: "B",
    });
    expect(
      result.cards.some(
        card =>
          card.cardId.includes("102") ||
          card.cardId.includes("903") ||
          card.cardId.includes("904")
      )
    ).toBe(false);
  });

  it("keeps November banquet-only in master mode while still including used banquet credentials", async () => {
    const result = await caller().getQrBusinessCardRoster({
      token: directorToken(),
      eventId: NOVEMBER_EVENT_ID,
      masterPrint: true,
    });

    expect(result.cards).toHaveLength(3);
    expect(result.cards.every(card => card.passType === "banquet")).toBe(true);
    expect(result.summary).toMatchObject({
      total: 3,
      poolCards: 0,
      banquetCards: 3,
    });
    expect(
      result.cards.find(card => card.cardId === "bowler-101-banquet")
    ).toMatchObject({ used: true });
    expect(
      result.cards.find(card => card.cardId === "guest-901-banquet")
    ).toMatchObject({ used: true });
  });

  it("rejects master-print filter conflicts after event authorization and before any roster read", async () => {
    await expect(
      caller().getQrBusinessCardRoster({
        token: directorToken(),
        eventId: EVENT_ID,
        masterPrint: true,
        centerId: 8,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("cannot be combined"),
    });

    expect(mocks.assertEventAccess).toHaveBeenCalledWith(
      expect.anything(),
      EVENT_ID
    );
    expect(mocks.assertBowlerAccess).not.toHaveBeenCalled();
    expect(mocks.rawQuery).not.toHaveBeenCalled();
  });

  it("enforces Event Director and event-scope guards before roster reads", async () => {
    mocks.resolveEdSession.mockResolvedValueOnce(null);
    await expect(
      caller().getQrBusinessCardRoster({
        token: "not-a-director-token",
        eventId: EVENT_ID,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assertEventAccess).not.toHaveBeenCalled();
    expect(mocks.rawQuery).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.assertEventAccess.mockRejectedValueOnce(
      new Error("event not assigned")
    );
    await expect(
      caller().getQrBusinessCardRoster({
        token: directorToken(),
        eventId: EVENT_ID,
      })
    ).rejects.toThrow("event not assigned");
    expect(mocks.assertEventAccess).toHaveBeenCalledWith(
      expect.anything(),
      EVENT_ID
    );
    expect(mocks.rawQuery).not.toHaveBeenCalled();
  });

  it("is read-only: it neither regenerates nor resets any token", async () => {
    await caller().getQrBusinessCardRoster({
      token: directorToken(),
      eventId: EVENT_ID,
      masterPrint: true,
    });

    expect(mutationStatements()).toEqual([]);
    expect(mocks.rawExec).not.toHaveBeenCalled();
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });
});
