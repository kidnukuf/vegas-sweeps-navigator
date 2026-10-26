import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  rawExec: vi.fn(),
  writeQRCodesToSheet: vi.fn().mockResolvedValue(undefined),
  writeContactInfoToSheet: vi.fn().mockResolvedValue(undefined),
  writeScanUsedToSheet: vi.fn().mockResolvedValue(undefined),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => ({
  rawQuery: mocks.rawQuery,
  rawExec: mocks.rawExec,
  updateBowler: vi.fn(),
  upsertHotelRecord: vi.fn(),
  upsertPaymentRecord: vi.fn(),
  writeAuditLog: mocks.writeAuditLog,
  getEventSheetTarget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./notifyED", () => ({ notifyED: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./googleSheets", () => ({
  writeQRCodesToSheet: mocks.writeQRCodesToSheet,
  writeContactInfoToSheet: mocks.writeContactInfoToSheet,
  writeScanUsedToSheet: mocks.writeScanUsedToSheet,
}));
vi.mock("./_core/edAuth", () => ({
  assertBowlerAccess: vi.fn().mockResolvedValue({ type: "owner", userId: 1 }),
  assertEventAccess: vi.fn().mockResolvedValue({ type: "owner", userId: 1 }),
  resolveEdSession: vi.fn().mockResolvedValue({ type: "owner", userId: 1 }),
}));
vi.mock("./turnstile", () => ({ verifyTurnstileToken: vi.fn().mockResolvedValue(undefined) }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:qr") } }));

import { bowlerAuthRouter } from "./routers/bowlerAuth";

const NOVEMBER_EVENT_ID = 3960003;
const OTHER_EVENT_ID = 3960004;

function caller() {
  return bowlerAuthRouter.createCaller({
    user: { id: 1, openId: "owner", role: "admin" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext);
}

function bowler(eventId: number) {
  return {
    id: 42,
    legalFirstName: "Legacy",
    legalLastName: "Pool",
    under21: 0,
    poolPartyToken: "LEGACY-POOL",
    poolPartyUsed: 0,
    banquetToken: "BANQUET-42",
    banquetUsed: 0,
    eventId,
  };
}

function guest(eventId: number, token = "GUEST-POOL") {
  return {
    id: 91,
    bowlerId: 42,
    suffix: "A",
    token,
    used: 0,
    disabled: 0,
    guestName: "Guest Name",
    legalFirstName: "Legacy",
    legalLastName: "Pool",
    eventId,
  };
}

function setQueryResponses({ eventId = NOVEMBER_EVENT_ID, guestToken = "GUEST-POOL" }: { eventId?: number; guestToken?: string } = {}) {
  mocks.rawQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM guest_pool_party_tokens g") && sql.includes("WHERE g.token = ?")) {
      return [guest(eventId, guestToken)];
    }
    if (sql.includes("FROM bowlers WHERE poolPartyToken = ?")) return [bowler(eventId)];
    if (sql.includes("SELECT eventId FROM bowlers WHERE id = ?")) return [{ eventId }];
    if (sql.includes("SELECT suffix FROM guest_pool_party_tokens")) return [];
    if (sql.includes("SELECT scantronId, eventId FROM bowlers WHERE id = ?")) {
      return [{ scantronId: "1234567890", eventId }];
    }
    if (sql.includes("SELECT id, eventId, scantronId")) {
      return [{
        id: 42,
        eventId,
        scantronId: "1234567890",
        legalFirstName: "Legacy",
        legalLastName: "Pool",
        laneNumber: 1,
        poolPartyToken: "LEGACY-POOL",
        banquetToken: "BANQUET-42",
      }];
    }
    if (sql.includes("SELECT suffix, token, banquetToken FROM guest_pool_party_tokens")) return [];
    return [];
  });
}

function tokenForBowler(bowlerId = 42) {
  return jwt.sign({ bowlerId, role: "Bowler" }, process.env.JWT_SECRET ?? "dev-secret", { expiresIn: "1h" });
}

describe("November event 3960003 pool-pass policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQueryResponses();
  });

  it("rejects legacy primary and guest pool passes before any scan mutation", async () => {
    const app = caller();

    await expect(app.validatePassportToken({ tokenValue: "LEGACY-POOL", passportType: "pool" }))
      .resolves.toMatchObject({ result: "invalid", message: "Pool passes are not available for this event." });
    await expect(app.validatePassportToken({ tokenValue: "GUEST-POOL", passportType: "guest-pool" }))
      .resolves.toMatchObject({ result: "invalid", message: "Pool passes are not available for this event." });
    await expect(app.scanPassport({ tokenValue: "LEGACY-POOL", passportType: "pool" }))
      .resolves.toMatchObject({ result: "invalid", message: "Pool passes are not available for this event." });
    await expect(app.scanPassport({ tokenValue: "GUEST-POOL", passportType: "guest-pool" }))
      .resolves.toMatchObject({ result: "invalid", message: "Pool passes are not available for this event." });

    expect(mocks.rawQuery.mock.calls.map(([sql]) => String(sql)).filter((sql) => /\bUPDATE\b/i.test(sql))).toEqual([]);
  });

  it("never treats a banquet-only -BQ guest placeholder as a guest-pool pass", async () => {
    setQueryResponses({ guestToken: "1234567890A-BQ" });
    const app = caller();

    await expect(app.validatePassportToken({ tokenValue: "1234567890A-BQ", passportType: "guest-pool" }))
      .resolves.toMatchObject({ result: "invalid" });
    await expect(app.scanPassport({ tokenValue: "1234567890A-BQ", passportType: "guest-pool" }))
      .resolves.toMatchObject({ result: "invalid" });

    expect(mocks.rawQuery.mock.calls.map(([sql]) => String(sql)).filter((sql) => /\bUPDATE\b/i.test(sql))).toEqual([]);
  });

  it("keeps pool behavior available for every non-November event", async () => {
    setQueryResponses({ eventId: OTHER_EVENT_ID });
    const app = caller();

    await expect(app.validatePassportToken({ tokenValue: "LEGACY-POOL", passportType: "pool" }))
      .resolves.toMatchObject({ result: "valid" });
    await expect(app.scanPassport({ tokenValue: "GUEST-POOL", passportType: "guest-pool" }))
      .resolves.toMatchObject({ result: "granted" });

    expect(mocks.rawQuery.mock.calls.map(([sql]) => String(sql))).toContainEqual(expect.stringContaining("UPDATE guest_pool_party_tokens SET used = 1"));
  });

  it("blocks November director pool issuance but leaves a banquet-only guest ticket creatable", async () => {
    const app = caller();

    await expect(app.enablePassport({ token: "director", bowlerId: 42, passportType: "pool" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Pool passes are not available for this event." });
    await expect(app.addGuestPass({ token: "director", bowlerId: 42 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Pool passes are not available for this event." });
    await expect(app.createGuestTicket({
      token: "director", bowlerId: 42, guestName: "Banquet Guest", includePoolParty: true, includeBanquet: false,
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("banquet-only") });

    const created = await app.createGuestTicket({
      token: "director", bowlerId: 42, guestName: "Banquet Guest", includePoolParty: false, includeBanquet: true,
    });
    expect(created).toMatchObject({
      success: true,
      guestId: "1234567890A",
      poolToken: null,
      banquetToken: "1234567890A-BQ",
    });
    const insert = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO guest_pool_party_tokens"));
    expect(insert?.[1]).toEqual(expect.arrayContaining(["1234567890A-BQ"]));
    expect(mocks.writeQRCodesToSheet).toHaveBeenCalledWith(expect.objectContaining({
      poolPartyToken: null,
      guestPoolTokens: [],
      banquetToken: "BANQUET-42",
    }));
  });

  it("clears a stale November primary pool token at sign-up and never issues fallback guest pool tokens", async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM bowlers b") && sql.includes("LOWER(TRIM(b.legalFirstName))")) {
        return [{
          id: 42,
          legalFirstName: "Legacy",
          legalLastName: "Pool",
          preferredName: null,
          email: null,
          phone: null,
          scantronId: "1234567890",
          registrationStatus: "pre_registered",
          passwordHash: null,
          isCapitain: 0,
          teamId: null,
          centerId: 7,
          teamName: null,
          centerName: "Test Center",
          laneNumber: null,
          squadTime: null,
          guestPoolPartyAmount: "30",
        }];
      }
      if (sql.includes("FROM bowler_claim_codes WHERE eventId = ?")) return [{ c: 0 }];
      if (sql.includes("SELECT poolPartyToken, banquetToken FROM bowlers")) {
        return [{ poolPartyToken: "STALE-POOL", banquetToken: "EXISTING-BANQUET" }];
      }
      return [];
    });

    await expect(caller().signUp({
      firstName: "Legacy",
      lastName: "Pool",
      eventId: NOVEMBER_EVENT_ID,
      centerId: 7,
      password: "SecurePassword123",
      turnstileToken: "mock-turnstile",
      turnstileAction: "bowler_signup",
    })).resolves.toMatchObject({ bowlerId: 42 });

    const update = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE bowlers SET"));
    expect(update?.[0]).toContain("poolPartyToken = NULL");
    expect(update?.[0]).toContain("banquetToken = ?");
    expect(update?.[1]).toEqual(expect.arrayContaining(["EXISTING-BANQUET", 42]));
    expect(mocks.rawQuery.mock.calls.map(([sql]) => String(sql))).not.toContainEqual(expect.stringContaining("INSERT INTO guest_pool_party_tokens"));
  });

  it("withholds November pool credentials from contact, passport-status, and business-card outputs", async () => {
    const passport = tokenForBowler();
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("UPDATE bowlers SET phone")) return [];
      if (sql.includes("SELECT b.id, b.legalFirstName") && sql.includes("b.phone, b.email")) {
        return [{
          ...bowler(NOVEMBER_EVENT_ID),
          scantronId: "1234567890", phone: "7025551212", email: "legacy@example.test",
          squadTime: null, laneNumber: 1, laneToEvent: null, teamName: null, centerName: null,
          eventName: "November", startDate: null, endDate: null, bowlingDate: null, isCapitain: 0,
        }];
      }
      if (sql.includes("SELECT guestPoolPartyAmount, scantronId FROM bowlers")) {
        return [{ guestPoolPartyAmount: "15", scantronId: "1234567890" }];
      }
      if (sql.includes("SELECT suffix, token, used, disabled, banquetToken")) {
        return [{ suffix: "A", token: "1234567890A-BQ", used: 0, disabled: 0, banquetToken: "1234567890A-BQ" }];
      }
      if (sql.includes("FROM bowlers b") && sql.includes("b.passwordHash IS NOT NULL")) {
        return [{
          id: 42, legalFirstName: "Legacy", legalLastName: "Pool", scantronId: "1234567890",
          centerName: null, teamName: null, poolPartyToken: "LEGACY-POOL", poolPartyUsed: 0,
          banquetToken: "BANQUET-42", banquetUsed: 0,
        }];
      }
      if (sql.includes("SELECT bowlerId, suffix, token, used, disabled FROM guest_pool_party_tokens")) {
        return [{ bowlerId: 42, suffix: "A", token: "1234567890A-BQ", used: 0, disabled: 0 }];
      }
      if (sql.includes("SELECT DISTINCT b.centerId AS id")) return [];
      if (sql.includes("SELECT DISTINCT b.teamId AS id")) return [];
      if (sql.includes("SELECT b.id, b.legalFirstName") && sql.includes("INNER JOIN events e")) {
        return [{
          id: 42, legalFirstName: "Legacy", legalLastName: "Pool", centerId: null, centerName: null,
          teamId: null, teamName: null, under21: 0, poolPartyEnabled: 1, poolPartyToken: "LEGACY-POOL",
          poolPartyUsed: 0, banquetToken: "BANQUET-42", banquetUsed: 0,
        }];
      }
      if (sql.includes("SELECT g.id, g.bowlerId")) {
        return [{
          id: 91, bowlerId: 42, legalFirstName: "Legacy", legalLastName: "Pool", centerId: null,
          centerName: null, teamId: null, teamName: null, guestName: "Banquet Guest", suffix: "A",
          under21: 0, poolPartyEnabled: 1, token: "1234567890A-BQ", used: 0,
          banquetToken: "1234567890A-BQ", banquetUsed: 0,
        }];
      }
      return [];
    });

    const contact = await caller().submitContactInfo({ token: passport, phone: "7025551212" });
    expect(contact).toMatchObject({ poolPartyToken: null, poolPartyQR: null, banquetToken: "BANQUET-42" });
    expect(contact.guestPoolQRs).toEqual([]);

    const status = await caller().getPassportStatus({ token: "director", eventId: NOVEMBER_EVENT_ID });
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ poolPartyToken: null, poolPartyUrl: null, banquetUrl: expect.stringContaining("BANQUET-42") });
    expect(status[0]?.guestPoolTokens).toEqual([]);

    const roster = await caller().getQrBusinessCardRoster({ token: "director", eventId: NOVEMBER_EVENT_ID });
    expect(roster.cards).toHaveLength(2);
    expect(roster.cards.map((card) => card.passType)).toEqual(["banquet", "banquet"]);
    expect(roster.summary).toMatchObject({ poolCards: 0, banquetCards: 2 });
  });

  it("suppresses pool output from the November profile without changing its stored banquet credential", async () => {
    const app = caller();
    const passport = tokenForBowler();
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM bowlers b") && sql.includes("WHERE b.id = ?")) {
        return [{
          ...bowler(NOVEMBER_EVENT_ID),
          preferredName: null, email: null, phone: null, scantronId: "1234567890", registrationStatus: "signed_up",
          isCapitain: 0, captainVerified: 0, teamId: null, centerId: null, teamName: null, teamCode: null,
          coordinatorName: null, centerName: null, leagueName: null, leagueCode: null, laneNumber: null, squadTime: null,
          laneNumber2: null, squadTime2: null, laneToEvent: null, eventName: "November", bowlingDate: null,
          tshirtSize: null, tshirtsProvided: 0, tshirtPickupLocation: null, tshirtPickupTime: null, poolPartyEnabled: 1,
          poolPartyTime: null, hotelName: null, checkinDate: null, checkoutDate: null, roomType: null, confirmationCode: null,
          totalAmountDue: null, paid: null, guestPoolPartyAmount: "15", banquetTable: null, banquetLocation: null,
          banquetTime: null, appDownloadDismissed: 0,
        }];
      }
      if (sql.includes("FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix")) {
        return [{ suffix: "A", token: "1234567890A", used: 0, disabled: 0, guestName: "Guest", banquetToken: "1234567890A-BQ", banquetUsed: 0, under21: 0 }];
      }
      return [];
    });

    const profile = await app.me({ token: passport });
    expect(profile).toMatchObject({ poolPartyToken: null, poolPartyQR: null, banquetToken: "BANQUET-42" });
    expect(profile.guestPoolQRs).toEqual([]);
    expect(profile.guestBanquetQRs).toHaveLength(1);
  });
});
