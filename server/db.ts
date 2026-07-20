import { and, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql2 from "mysql2/promise";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── USERS (Manus OAuth) ─────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach((f) => {
    if (user[f] !== undefined) { values[f] = user[f] ?? null; updateSet[f] = user[f] ?? null; }
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── RAW SQL HELPERS (for tables not yet in Drizzle schema object) ────────────
// We bypass Drizzle's ORM layer and use the underlying mysql2 pool directly
// so that ? placeholders are properly bound as prepared-statement parameters.
let _pool: mysql2.Pool | null = null;

function getPool(): mysql2.Pool {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = mysql2.createPool(process.env.DATABASE_URL);
  }
  if (!_pool) throw new Error("No DATABASE_URL configured");
  return _pool;
}

export async function rawQuery<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute(query, params);
  return rows as T[];
}

// Like rawQuery but returns the OkPacket (insertId / affectedRows) for write statements.
export async function rawExec(query: string, params: unknown[] = []): Promise<{ insertId: number; affectedRows: number }> {
  const pool = getPool();
  const [result] = await pool.execute(query, params);
  return result as unknown as { insertId: number; affectedRows: number };
}

// ─── BOWLING CENTERS ─────────────────────────────────────────────────────────
export async function getAllCenters() {
  return rawQuery("SELECT * FROM bowling_centers ORDER BY centerCode");
}

export async function getCenterByCode(code: string) {
  const rows = await rawQuery("SELECT * FROM bowling_centers WHERE centerCode = ? LIMIT 1", [code]);
  return rows[0] ?? null;
}

export async function getCenterByName(name: string) {
  const rows = await rawQuery("SELECT * FROM bowling_centers WHERE LOWER(centerName) LIKE LOWER(?) LIMIT 1", [`%${name}%`]);
  return rows[0] ?? null;
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────
export async function getActiveEvent() {
  const rows = await rawQuery("SELECT * FROM events WHERE status = 'active' ORDER BY id DESC LIMIT 1");
  return rows[0] ?? null;
}

export async function getAllEvents() {
  return rawQuery("SELECT * FROM events ORDER BY id DESC");
}

export async function getEventById(id: number) {
  const rows = await rawQuery("SELECT * FROM events WHERE id = ? LIMIT 1", [id]);
  return rows[0] ?? null;
}

/**
 * Fetch the Google Sheet target (spreadsheet ID + tab name) for an event.
 * Returns { spreadsheetId, sheetName } which may contain nulls; googleSheets
 * helpers fall back to the master default when a field is empty.
 */
export async function getEventSheetTarget(
  eventId: number
): Promise<{ spreadsheetId: string | null; sheetName: string | null }> {
  const rows = await rawQuery<{ sheetSpreadsheetId: string | null; sheetTabName: string | null }>(
    "SELECT sheetSpreadsheetId, sheetTabName FROM events WHERE id = ? LIMIT 1",
    [eventId]
  );
  const row = rows[0];
  return {
    spreadsheetId: row?.sheetSpreadsheetId ?? null,
    sheetName: row?.sheetTabName ?? null,
  };
}

export async function updateEventSheetTarget(
  eventId: number,
  spreadsheetId: string | null,
  sheetTabName: string | null
) {
  await rawQuery(
    "UPDATE events SET sheetSpreadsheetId = ?, sheetTabName = ? WHERE id = ?",
    [spreadsheetId, sheetTabName, eventId]
  );
}

export async function createEvent(eventName: string, eventYear: number) {
  const result = await rawExec(
    "INSERT INTO events (eventName, eventYear, status) VALUES (?, ?, 'active')",
    [eventName, eventYear]
  );
  return result.insertId;
}

export async function renameEvent(id: number, eventName: string, eventYear?: number) {
  if (eventYear !== undefined) {
    await rawQuery("UPDATE events SET eventName = ?, eventYear = ? WHERE id = ?", [eventName, eventYear, id]);
  } else {
    await rawQuery("UPDATE events SET eventName = ? WHERE id = ?", [eventName, id]);
  }
}

// Deletes a bowler and its dependent records. The live DB has historically used
// both snake_case and camelCase variants for some tables, so we only delete from
// the dependent tables that actually exist and have a `bowlerId` column.
export async function deleteBowler(bowlerId: number) {
  const candidates = [
    "hotel_records", "hotelRecords",
    "payment_records", "paymentRecords",
    "entry_tokens", "entryTokens",
    "wristbands",
    "check_ins", "checkIns",
    "lane_assignments", "laneAssignments",
    "redemptions",
  ];
  for (const table of candidates) {
    const cols = await rawQuery(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'bowlerId'`,
      [table]
    );
    if (cols.length > 0) {
      await rawQuery(`DELETE FROM \`${table}\` WHERE bowlerId = ?`, [bowlerId]);
    }
  }
  await rawQuery("DELETE FROM bowlers WHERE id = ?", [bowlerId]);
}

// ─── LEAGUES ─────────────────────────────────────────────────────────────────
export async function getLeaguesByEvent(eventId: number) {
  return rawQuery("SELECT * FROM leagues WHERE eventId = ?", [eventId]);
}

// ─── TEAMS ───────────────────────────────────────────────────────────────────
export async function getTeamsByCenter(centerId: number, eventId: number) {
  return rawQuery("SELECT * FROM teams WHERE centerId = ? AND eventId = ? ORDER BY teamCode", [centerId, eventId]);
}

export async function getTeamById(id: number) {
  const rows = await rawQuery("SELECT * FROM teams WHERE id = ? LIMIT 1", [id]);
  return rows[0] ?? null;
}

export async function updateTeamStatus(teamId: number, status: "gray" | "yellow" | "green") {
  await rawQuery("UPDATE teams SET status = ? WHERE id = ?", [status, teamId]);
}

// ─── BOWLERS ─────────────────────────────────────────────────────────────────
export async function getBowlersByTeam(teamId: number) {
  return rawQuery(`
    SELECT b.*, bc.centerName, t.teamName, t.teamCode
    FROM bowlers b
    LEFT JOIN bowling_centers bc ON b.centerId = bc.id
    LEFT JOIN teams t ON b.teamId = t.id
    WHERE b.teamId = ?
    ORDER BY b.bowlerPosition
  `, [teamId]);
}

export async function getBowlerById(id: number) {
  const rows = await rawQuery(`
    SELECT b.*, bc.centerName, bc.centerCode, t.teamName, t.teamCode, l.leagueName, l.leagueCode, l.eventCode,
           e.banquetLocation, e.banquetTime
    FROM bowlers b
    LEFT JOIN bowling_centers bc ON b.centerId = bc.id
    LEFT JOIN teams t ON b.teamId = t.id
    LEFT JOIN leagues l ON b.leagueId = l.id
    LEFT JOIN events e ON b.eventId = e.id
    WHERE b.id = ? LIMIT 1
  `, [id]);
  return rows[0] ?? null;
}

export async function getBowlerByScantronId(scantronId: string) {
  const rows = await rawQuery(`
    SELECT b.*, bc.centerName, bc.centerCode, t.teamName, t.teamCode
    FROM bowlers b
    LEFT JOIN bowling_centers bc ON b.centerId = bc.id
    LEFT JOIN teams t ON b.teamId = t.id
    WHERE b.scantronId = ? LIMIT 1
  `, [scantronId]);
  return rows[0] ?? null;
}

export async function searchBowlers(query: string, eventId?: number) {
  const q = `%${query}%`;
  const eventFilter = eventId ? `AND b.eventId = ${eventId}` : "";
  return rawQuery(`
    SELECT b.*, bc.centerName, t.teamName, t.teamCode
    FROM bowlers b
    LEFT JOIN bowling_centers bc ON b.centerId = bc.id
    LEFT JOIN teams t ON b.teamId = t.id
    WHERE (
      b.legalFirstName LIKE ? OR b.legalLastName LIKE ? OR
      CONCAT(b.legalFirstName, ' ', b.legalLastName) LIKE ? OR
      b.scantronId LIKE ? OR b.phone LIKE ? OR b.email LIKE ?
    ) ${eventFilter}
    ORDER BY b.legalLastName, b.legalFirstName
    LIMIT 100
  `, [q, q, q, q, q, q]);
}

export async function matchBowlerForSignup(phone: string, email: string, firstName: string, lastName: string) {
  // Priority 1: phone match
  if (phone) {
    const rows = await rawQuery("SELECT * FROM bowlers WHERE phone = ? LIMIT 1", [phone]);
    if (rows.length > 0) return { bowler: rows[0], matchMethod: "phone" };
  }
  // Priority 2: email match
  if (email) {
    const rows = await rawQuery("SELECT * FROM bowlers WHERE email = ? LIMIT 1", [email]);
    if (rows.length > 0) return { bowler: rows[0], matchMethod: "email" };
  }
  // Priority 3: full name match
  if (firstName && lastName) {
    const rows = await rawQuery(
      "SELECT * FROM bowlers WHERE LOWER(legalFirstName) = LOWER(?) AND LOWER(legalLastName) = LOWER(?) LIMIT 1",
      [firstName, lastName]
    );
    if (rows.length > 0) return { bowler: rows[0], matchMethod: "name" };
  }
  return null;
}

export async function updateBowlerRegistrationStatus(bowlerId: number, status: string, appUserId?: number) {
  if (appUserId) {
    await rawQuery("UPDATE bowlers SET registrationStatus = ?, appUserId = ? WHERE id = ?", [status, appUserId, bowlerId]);
  } else {
    await rawQuery("UPDATE bowlers SET registrationStatus = ? WHERE id = ?", [status, bowlerId]);
  }
}

export async function updateBowler(bowlerId: number, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter(k => fields[k] !== undefined);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `\`${k}\` = ?`).join(", ");
  const values = keys.map(k => fields[k]);
  await rawQuery(`UPDATE bowlers SET ${setClause} WHERE id = ?`, [...values, bowlerId]);
}

export async function getAllBowlersForAdmin(eventId: number) {
  return rawQuery(`
    SELECT b.*, bc.centerName, bc.centerCode, t.teamName, t.teamCode,
           l.leagueName, l.leagueCode,
           hr.checkinDate, hr.checkoutDate, hr.roomType, hr.roommateRequested,
           hr.roommateFirstName, hr.roommateLastName, hr.roomAmount,
           pr.banquetAmount, pr.poolParty, pr.totalAmountDue, pr.paid
    FROM bowlers b
    LEFT JOIN bowling_centers bc ON b.centerId = bc.id
    LEFT JOIN teams t ON b.teamId = t.id
    LEFT JOIN leagues l ON b.leagueId = l.id
    LEFT JOIN hotel_records hr ON hr.bowlerId = b.id
    LEFT JOIN payment_records pr ON pr.bowlerId = b.id
    WHERE b.eventId = ?
    ORDER BY bc.centerCode, t.teamCode, b.bowlerPosition
  `, [eventId]);
}

export async function getAdminStats(eventId: number) {
  const rows = await rawQuery(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN registrationStatus = 'pre_registered' THEN 1 ELSE 0 END) as preRegistered,
      SUM(CASE WHEN registrationStatus = 'signed_up' THEN 1 ELSE 0 END) as signedUp,
      SUM(CASE WHEN registrationStatus = 'verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN registrationStatus = 'checked_in' THEN 1 ELSE 0 END) as checkedIn,
      SUM(CASE WHEN registrationStatus = 'unmatched' THEN 1 ELSE 0 END) as unmatched
    FROM bowlers WHERE eventId = ?
  `, [eventId]);
  return rows[0] ?? { total: 0, preRegistered: 0, signedUp: 0, verified: 0, checkedIn: 0, unmatched: 0 };
}

// ─── APP USERS (role accounts) ────────────────────────────────────────────────
export async function getAppUserByUsername(username: string) {
  const rows = await rawQuery("SELECT * FROM app_users WHERE username = ? AND active = true LIMIT 1", [username]);
  return rows[0] ?? null;
}

export async function createAppUser(data: {
  username: string; designation: string; appRole: string;
  passwordHash: string; eventId?: number; leagueId?: number;
  teamId?: number; bowlerId?: number; createdBy?: number;
}) {
  const result = await rawQuery(
    "INSERT INTO app_users (username, designation, appRole, passwordHash, eventId, leagueId, teamId, bowlerId, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [data.username, data.designation, data.appRole, data.passwordHash, data.eventId ?? null, data.leagueId ?? null, data.teamId ?? null, data.bowlerId ?? null, data.createdBy ?? null]
  );
  return result;
}

export async function getDoormanAccounts(eventId: number) {
  return rawQuery("SELECT id, username, designation, active, createdAt FROM app_users WHERE appRole = 'Doorman' AND eventId = ? ORDER BY designation", [eventId]);
}

// ─── ENTRY TOKENS (QR codes) ─────────────────────────────────────────────────
export async function createEntryToken(bowlerId: number, eventId: number, tokenValue: string, tokenType: string = "initial") {
  await rawQuery(
    "INSERT INTO entry_tokens (bowlerId, eventId, tokenValue, tokenType) VALUES (?, ?, ?, ?)",
    [bowlerId, eventId, tokenValue, tokenType]
  );
}

export async function getTokenByValue(tokenValue: string) {
  const rows = await rawQuery("SELECT * FROM entry_tokens WHERE tokenValue = ? LIMIT 1", [tokenValue]);
  return rows[0] ?? null;
}

export async function invalidateToken(tokenId: number) {
  await rawQuery("UPDATE entry_tokens SET isUsed = true, usedAt = NOW() WHERE id = ?", [tokenId]);
}

export async function getBowlerActiveToken(bowlerId: number, eventId: number) {
  const rows = await rawQuery(
    "SELECT * FROM entry_tokens WHERE bowlerId = ? AND eventId = ? AND isUsed = false AND tokenType = 'initial' ORDER BY createdAt DESC LIMIT 1",
    [bowlerId, eventId]
  );
  return rows[0] ?? null;
}

// ─── CHECK-INS ───────────────────────────────────────────────────────────────
export async function createCheckIn(bowlerId: number, eventId: number, method: string, doormanId?: number, tokenId?: number) {
  await rawQuery(
    "INSERT INTO check_ins (bowlerId, eventId, method, doormanId, tokenId) VALUES (?, ?, ?, ?, ?)",
    [bowlerId, eventId, method, doormanId ?? null, tokenId ?? null]
  );
  await rawQuery("UPDATE bowlers SET registrationStatus = 'checked_in' WHERE id = ?", [bowlerId]);
}

// ─── WRISTBANDS ──────────────────────────────────────────────────────────────
export async function issueWristband(bowlerId: number, eventId: number, doormanId: number, reentryTokenId?: number) {
  // Check if already issued
  const existing = await rawQuery("SELECT id FROM wristbands WHERE bowlerId = ? AND eventId = ? LIMIT 1", [bowlerId, eventId]);
  if (existing.length > 0) throw new Error("Wristband already issued for this bowler");
  await rawQuery(
    "INSERT INTO wristbands (bowlerId, eventId, issuedByDoormanId, reentryTokenId, status) VALUES (?, ?, ?, ?, 'active')",
    [bowlerId, eventId, doormanId, reentryTokenId ?? null]
  );
  await rawQuery("UPDATE entry_tokens SET wristbandIssued = true WHERE bowlerId = ? AND eventId = ?", [bowlerId, eventId]);
}

export async function getWristbandByBowler(bowlerId: number, eventId: number) {
  const rows = await rawQuery("SELECT * FROM wristbands WHERE bowlerId = ? AND eventId = ? LIMIT 1", [bowlerId, eventId]);
  return rows[0] ?? null;
}

export async function denyWristband(wristbandId: number, reason: string) {
  await rawQuery("UPDATE wristbands SET status = 'denied', denialReason = ? WHERE id = ?", [reason, wristbandId]);
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────
export async function writeAuditLog(entry: {
  eventId?: number; actorRole: string; actorId?: number;
  action: string; targetId?: number; targetType?: string;
  details?: string; ipAddress?: string; deviceId?: string;
}) {
  await rawQuery(
    "INSERT INTO auditLog (eventId, actorRole, actorId, action, targetId, targetType, details, ipAddress, deviceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [entry.eventId ?? null, entry.actorRole, entry.actorId ?? null, entry.action, entry.targetId ?? null, entry.targetType ?? null, entry.details ?? null, entry.ipAddress ?? null, entry.deviceId ?? null]
  );
}

export async function getAuditLog(eventId?: number, limit: number = 100) {
  const filter = eventId ? `WHERE eventId = ${eventId}` : "";
  return rawQuery(`SELECT * FROM auditLog ${filter} ORDER BY id DESC LIMIT ${limit}`);
}

// ─── IMPORT SESSIONS ─────────────────────────────────────────────────────────
export async function createImportSession(data: {
  eventId?: number; importedBy?: number; sourceType: string; sourceName?: string;
}) {
  const result = await rawQuery(
    "INSERT INTO import_sessions (eventId, importedBy, sourceType, sourceName, status) VALUES (?, ?, ?, ?, 'processing')",
    [data.eventId ?? null, data.importedBy ?? null, data.sourceType, data.sourceName ?? null]
  );
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateImportSession(id: number, data: {
  totalRows?: number; importedRows?: number; updatedRows?: number;
  skippedRows?: number; errorRows?: number; status?: string; errorDetails?: unknown;
}) {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return;
  const setClause = fields.map(([k]) => `\`${k}\` = ?`).join(", ");
  const values = fields.map(([, v]) => typeof v === "object" ? JSON.stringify(v) : v);
  const completedAt = data.status === "completed" || data.status === "failed" ? ", completedAt = NOW()" : "";
  await rawQuery(`UPDATE import_sessions SET ${setClause}${completedAt} WHERE id = ?`, [...values, id]);
}

export async function getImportHistory(eventId?: number) {
  const filter = eventId ? `WHERE eventId = ${eventId}` : "";
  return rawQuery(`SELECT * FROM import_sessions ${filter} ORDER BY createdAt DESC LIMIT 20`);
}

// ─── HOTEL + PAYMENT ─────────────────────────────────────────────────────────
export async function upsertHotelRecord(bowlerId: number, data: Record<string, unknown>) {
  // Filter out undefined values — MySQL2 rejects undefined bind parameters
  const safeData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const existing = await rawQuery("SELECT id FROM hotel_records WHERE bowlerId = ? LIMIT 1", [bowlerId]);
  if (existing.length > 0) {
    const keys = Object.keys(safeData);
    if (keys.length === 0) return;
    const setClause = keys.map(k => `\`${k}\` = ?`).join(", ");
    await rawQuery(`UPDATE hotel_records SET ${setClause} WHERE bowlerId = ?`, [...Object.values(safeData), bowlerId]);
  } else {
    const keys = ["bowlerId", ...Object.keys(safeData)];
    const vals = [bowlerId, ...Object.values(safeData)];
    const placeholders = keys.map(() => "?").join(", ");
    await rawQuery(`INSERT INTO hotel_records (${keys.map(k => `\`${k}\``).join(", ")}) VALUES (${placeholders})`, vals);
  }
}

export async function upsertPaymentRecord(bowlerId: number, data: Record<string, unknown>) {
  // Filter out undefined values — MySQL2 rejects undefined bind parameters
  const safeData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const existing = await rawQuery("SELECT id FROM payment_records WHERE bowlerId = ? LIMIT 1", [bowlerId]);
  if (existing.length > 0) {
    const keys = Object.keys(safeData);
    if (keys.length === 0) return;
    const setClause = keys.map(k => `\`${k}\` = ?`).join(", ");
    await rawQuery(`UPDATE payment_records SET ${setClause} WHERE bowlerId = ?`, [...Object.values(safeData), bowlerId]);
  } else {
    const keys = ["bowlerId", ...Object.keys(safeData)];
    const vals = [bowlerId, ...Object.values(safeData)];
    const placeholders = keys.map(() => "?").join(", ");
    await rawQuery(`INSERT INTO payment_records (${keys.map(k => `\`${k}\``).join(", ")}) VALUES (${placeholders})`, vals);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// OFFLINE DOOR SCANNER (single-laptop, banquet + pool party)
// ════════════════════════════════════════════════════════════════════════════

export type DoorMode = "banquet" | "pool";
export type ReentryZone = "N" | "E" | "S" | "W";

export type DoorGuestRow = {
  token: string;
  displayName: string;
  teamNumber: string | null;
  teamName: string | null;
  entitlementType: "bowler" | "guest";
  guestSuffix: string | null;
  alreadyUsedAtLoad: boolean;
  /** 🟠 Orange column letter for this QR code (e.g., 'AB', 'AD', 'AF') */
  orangeColumn?: string;
  /** 🟣 Purple column letter directly to the right (e.g., 'AC', 'AE', 'AG') */
  purpleColumn?: string;
  /** Bowler ID or guest ID for sheet row lookup */
  bowlerId?: number;
  /** Lane number for sheet row lookup */
  laneNumber?: number | null;
};

/**
 * Build the complete offline validation dataset for one event + mode.
 * Banquet mode loads banquet tokens (bowlers + guest banquet tokens).
 * Pool mode loads pool party tokens (bowlers + guest pool tokens).
 * Each row carries the current "used" status so the device can pre-mark them.
 */
export async function loadDoorGuests(eventId: number, mode: DoorMode): Promise<DoorGuestRow[]> {
  const out: DoorGuestRow[] = [];

  if (mode === "banquet") {
    // Primary bowlers with a banquet token
    const bowlerRows = await rawQuery<{
      token: string; legalFirstName: string; legalLastName: string;
      teamCode: string | null; teamName: string | null; banquetUsed: number;
      bowlerId: number; laneNumber: number | null;
    }>(
      `SELECT b.banquetToken AS token, b.legalFirstName, b.legalLastName,
              t.teamCode, t.teamName, b.banquetUsed, b.id AS bowlerId, b.laneNumber
       FROM bowlers b
       LEFT JOIN teams t ON t.id = b.teamId
       WHERE b.eventId = ? AND b.banquetToken IS NOT NULL AND b.banquetToken <> ''`,
      [eventId]
    );
    for (const r of bowlerRows) {
      out.push({
        token: r.token,
        displayName: `${r.legalFirstName} ${r.legalLastName}`.trim(),
        teamNumber: r.teamCode ?? null,
        teamName: r.teamName ?? null,
        entitlementType: "bowler",
        guestSuffix: null,
        alreadyUsedAtLoad: Boolean(r.banquetUsed),
        orangeColumn: "AB",
        purpleColumn: "AC",
        bowlerId: r.bowlerId,
        laneNumber: r.laneNumber,
      });
    }
    // Guest banquet tokens
    const guestRows = await rawQuery<{
      token: string; suffix: string; banquetUsed: number; disabled: number;
      legalFirstName: string; legalLastName: string;
      teamCode: string | null; teamName: string | null;
      bowlerId: number; laneNumber: number | null;
    }>(
      `SELECT g.banquetToken AS token, g.suffix, g.banquetUsed, g.disabled,
              b.legalFirstName, b.legalLastName, t.teamCode, t.teamName, b.id AS bowlerId, b.laneNumber
       FROM guest_pool_party_tokens g
       JOIN bowlers b ON b.id = g.bowlerId
       LEFT JOIN teams t ON t.id = b.teamId
       WHERE g.eventId = ? AND g.banquetToken IS NOT NULL AND g.banquetToken <> '' AND g.disabled = 0`,
      [eventId]
    );
    for (const r of guestRows) {
      out.push({
        token: r.token,
        displayName: `${r.legalFirstName} ${r.legalLastName} (Guest ${r.suffix})`.trim(),
        teamNumber: r.teamCode ?? null,
        teamName: r.teamName ?? null,
        entitlementType: "guest",
        guestSuffix: r.suffix,
        alreadyUsedAtLoad: Boolean(r.banquetUsed),
        orangeColumn: "X",
        purpleColumn: "Y",
        bowlerId: r.bowlerId,
        laneNumber: r.laneNumber,
      });
    }
  } else {
    // Pool mode — primary bowlers with a pool party token
    const bowlerRows = await rawQuery<{
      token: string; legalFirstName: string; legalLastName: string;
      teamCode: string | null; teamName: string | null; poolPartyUsed: number;
      bowlerId: number; laneNumber: number | null;
    }>(
      `SELECT b.poolPartyToken AS token, b.legalFirstName, b.legalLastName,
              t.teamCode, t.teamName, b.poolPartyUsed, b.id AS bowlerId, b.laneNumber
       FROM bowlers b
       LEFT JOIN teams t ON t.id = b.teamId
       WHERE b.eventId = ? AND b.poolPartyToken IS NOT NULL AND b.poolPartyToken <> ''`,
      [eventId]
    );
    for (const r of bowlerRows) {
      out.push({
        token: r.token,
        displayName: `${r.legalFirstName} ${r.legalLastName}`.trim(),
        teamNumber: r.teamCode ?? null,
        teamName: r.teamName ?? null,
        entitlementType: "bowler",
        guestSuffix: null,
        alreadyUsedAtLoad: Boolean(r.poolPartyUsed),
        orangeColumn: "AD",
        purpleColumn: "AE",
        bowlerId: r.bowlerId,
        laneNumber: r.laneNumber,
      });
    }
    // Guest pool tokens
    const guestRows = await rawQuery<{
      token: string; suffix: string; used: number; disabled: number;
      legalFirstName: string; legalLastName: string;
      teamCode: string | null; teamName: string | null;
      bowlerId: number; laneNumber: number | null;
    }>(
      `SELECT g.token AS token, g.suffix, g.used, g.disabled,
              b.legalFirstName, b.legalLastName, t.teamCode, t.teamName, b.id AS bowlerId, b.laneNumber
       FROM guest_pool_party_tokens g
       JOIN bowlers b ON b.id = g.bowlerId
       LEFT JOIN teams t ON t.id = b.teamId
       WHERE g.eventId = ? AND g.token IS NOT NULL AND g.token <> '' AND g.disabled = 0`,
      [eventId]
    );
    for (const r of guestRows) {
      out.push({
        token: r.token,
        displayName: `${r.legalFirstName} ${r.legalLastName} (Guest ${r.suffix})`.trim(),
        teamNumber: r.teamCode ?? null,
        teamName: r.teamName ?? null,
        entitlementType: "guest",
        guestSuffix: r.suffix,
        alreadyUsedAtLoad: Boolean(r.used),
        orangeColumn: "AF",
        purpleColumn: "AG",
        bowlerId: r.bowlerId,
        laneNumber: r.laneNumber,
      });
    }
  }

  return out;
}

/**
 * Ensure the 200-code reentry pool (50 per N/E/S/W zone) exists for an event + mode.
 * Idempotent: only inserts codes for zones that don't yet have the full count.
 * Returns all reentry codes for the event + mode.
 */
export async function ensureReentryPool(
  eventId: number,
  mode: DoorMode,
  makeToken: (eventId: number, mode: DoorMode, zone: ReentryZone, index: number) => string,
  perZone = 50
) {
  const zones: ReentryZone[] = ["N", "E", "S", "W"];
  for (const zone of zones) {
    const existing = await rawQuery<{ c: number }>(
      "SELECT COUNT(*) AS c FROM reentry_codes WHERE eventId = ? AND mode = ? AND zone = ?",
      [eventId, mode, zone]
    );
    const have = Number(existing[0]?.c ?? 0);
    for (let i = have; i < perZone; i++) {
      const token = makeToken(eventId, mode, zone, i + 1);
      // Token has a UNIQUE constraint; ignore dupes defensively.
      try {
        await rawExec(
          "INSERT INTO reentry_codes (eventId, mode, zone, token, inUse) VALUES (?, ?, ?, ?, 0)",
          [eventId, mode, zone, token]
        );
      } catch {
        /* duplicate token — skip */
      }
    }
  }
  return getReentryPool(eventId, mode);
}

export async function getReentryPool(eventId: number, mode: DoorMode) {
  return rawQuery<{
    id: number; eventId: number; mode: string; zone: string; token: string;
    inUse: number; linkedWristband: string | null; issuedAtMs: number | null; releasedAtMs: number | null;
  }>(
    "SELECT id, eventId, mode, zone, token, inUse, linkedWristband, issuedAtMs, releasedAtMs FROM reentry_codes WHERE eventId = ? AND mode = ? ORDER BY zone, id",
    [eventId, mode]
  );
}

/** Issue a reentry code: link it to a wristband at a zone (door-locked). */
export async function issueReentryCode(token: string, wristbandNumber: string, issuedAtMs: number) {
  await rawExec(
    "UPDATE reentry_codes SET inUse = 1, linkedWristband = ?, issuedAtMs = ?, releasedAtMs = NULL WHERE token = ?",
    [wristbandNumber, issuedAtMs, token]
  );
}

/** Release a reentry code back into the available pool. */
export async function releaseReentryCode(token: string, releasedAtMs: number) {
  await rawExec(
    "UPDATE reentry_codes SET inUse = 0, linkedWristband = NULL, releasedAtMs = ? WHERE token = ?",
    [releasedAtMs, token]
  );
}

export async function getReentryCodeByToken(token: string) {
  const rows = await rawQuery<{
    id: number; eventId: number; mode: string; zone: string; token: string;
    inUse: number; linkedWristband: string | null;
  }>(
    "SELECT id, eventId, mode, zone, token, inUse, linkedWristband FROM reentry_codes WHERE token = ? LIMIT 1",
    [token]
  );
  return rows[0] ?? null;
}

/**
 * Mark a token as used in the canonical tables when an offline ADMIT/OVERRIDE syncs up.
 * Mirrors the live scanPassport used-marking. Returns the bowler/guest name + lane
 * info needed for the Google Sheet write-back (or null if the token isn't found).
 */
export async function markTokenUsedForSync(
  token: string,
  mode: DoorMode
): Promise<{ firstName: string; lastName: string; sheetType: "banquet" | "pool" | "guest_pool"; eventId: number | null } | null> {
  if (mode === "banquet") {
    // Primary bowler banquet token
    const b = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; eventId: number | null }>(
      "SELECT id, legalFirstName, legalLastName, eventId FROM bowlers WHERE banquetToken = ? LIMIT 1",
      [token]
    );
    if (b[0]) {
      await rawExec("UPDATE bowlers SET banquetUsed = 1 WHERE id = ?", [b[0].id]);
      return { firstName: b[0].legalFirstName, lastName: b[0].legalLastName, sheetType: "banquet", eventId: b[0].eventId };
    }
    // Guest banquet token
    const g = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; eventId: number | null }>(
      `SELECT g.id, b.legalFirstName, b.legalLastName, b.eventId
       FROM guest_pool_party_tokens g JOIN bowlers b ON b.id = g.bowlerId
       WHERE g.banquetToken = ? LIMIT 1`,
      [token]
    );
    if (g[0]) {
      await rawExec("UPDATE guest_pool_party_tokens SET banquetUsed = 1 WHERE id = ?", [g[0].id]);
      return { firstName: g[0].legalFirstName, lastName: g[0].legalLastName, sheetType: "guest_pool", eventId: g[0].eventId };
    }
    return null;
  } else {
    // Primary bowler pool token
    const b = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; eventId: number | null }>(
      "SELECT id, legalFirstName, legalLastName, eventId FROM bowlers WHERE poolPartyToken = ? LIMIT 1",
      [token]
    );
    if (b[0]) {
      await rawExec("UPDATE bowlers SET poolPartyUsed = 1 WHERE id = ?", [b[0].id]);
      return { firstName: b[0].legalFirstName, lastName: b[0].legalLastName, sheetType: "pool", eventId: b[0].eventId };
    }
    // Guest pool token
    const g = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; eventId: number | null }>(
      `SELECT g.id, b.legalFirstName, b.legalLastName, b.eventId
       FROM guest_pool_party_tokens g JOIN bowlers b ON b.id = g.bowlerId
       WHERE g.token = ? LIMIT 1`,
      [token]
    );
    if (g[0]) {
      await rawExec("UPDATE guest_pool_party_tokens SET used = 1 WHERE id = ?", [g[0].id]);
      return { firstName: g[0].legalFirstName, lastName: g[0].legalLastName, sheetType: "guest_pool", eventId: g[0].eventId };
    }
    return null;
  }
}

/**
 * Persist one synced offline scan into door_scan_log. Idempotent on (token, scannedAtMs)
 * via the unique key — duplicate rows are silently ignored (INSERT IGNORE semantics).
 * Returns true if a NEW row was inserted, false if it was a duplicate.
 */
export async function recordSyncedScan(scan: {
  eventId: number | null;
  mode: DoorMode;
  token: string;
  result: string;
  reason: string | null;
  lane: number | null;
  scannedAtMs: number;
  overrideBy: string | null;
  wristbandNumber: string | null;
  edFlagged: boolean;
  deviceId: string | null;
}): Promise<boolean> {
  const res = await rawExec(
    `INSERT IGNORE INTO door_scan_log
       (eventId, mode, token, result, reason, lane, scannedAtMs, overrideBy, wristbandNumber, edFlagged, deviceId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scan.eventId, scan.mode, scan.token, scan.result, scan.reason, scan.lane,
      scan.scannedAtMs, scan.overrideBy, scan.wristbandNumber, scan.edFlagged ? 1 : 0, scan.deviceId,
    ]
  );
  return res.affectedRows > 0;
}

/** ED review queue: flagged, not-yet-reviewed scans for an event. */
export async function getEdFlagQueue(eventId: number) {
  return rawQuery(
    `SELECT id, mode, token, result, reason, lane, scannedAtMs, overrideBy, wristbandNumber, edReviewedAt
     FROM door_scan_log
     WHERE eventId = ? AND edFlagged = 1
     ORDER BY edReviewedAt IS NOT NULL, scannedAtMs DESC`,
    [eventId]
  );
}

export async function markEdFlagReviewed(id: number, reviewedAtMs: number) {
  await rawExec("UPDATE door_scan_log SET edReviewedAt = ? WHERE id = ?", [reviewedAtMs, id]);
}

/** Door scan counts for the Console dashboard. */
export async function getDoorScanStats(eventId: number, mode: DoorMode) {
  const rows = await rawQuery<{ result: string; c: number }>(
    "SELECT result, COUNT(*) AS c FROM door_scan_log WHERE eventId = ? AND mode = ? GROUP BY result",
    [eventId, mode]
  );
  return rows;
}


/**
 * Build sheet-paste-ready check-in export rows for one event + mode.
 *
 * Pulls every ADMIT-type scan from door_scan_log (admitted / override_admitted /
 * reentry_admitted) and resolves each token to the bowler's name, lane, and team so
 * the export can be matched to the Google Sheet by name + lane. Read-only: it never
 * mutates any table. Returns the earliest admit timestamp per token (first entry wins).
 */
export type CheckinExportRow = {
  token: string;
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  teamNumber: string | null;
  sheetType: "banquet" | "pool" | "guest_pool";
  scannedAtMs: number;
  result: string;
  isReentry: boolean;
};

export async function getCheckinExportRows(
  eventId: number,
  mode: DoorMode
): Promise<CheckinExportRow[]> {
  // All admit-type scans, earliest first so the first real entry wins per token.
  const scans = await rawQuery<{
    token: string;
    result: string;
    lane: number | null;
    scannedAtMs: number;
  }>(
    `SELECT token, result, lane, scannedAtMs
       FROM door_scan_log
      WHERE eventId = ? AND mode = ?
        AND result IN ('admitted', 'override_admitted', 'reentry_admitted')
      ORDER BY scannedAtMs ASC`,
    [eventId, mode]
  );

  // Keep the first admit per token (dedupe re-scans/reentries onto one row).
  const firstByToken = new Map<string, { result: string; lane: number | null; scannedAtMs: number }>();
  for (const s of scans) {
    if (!firstByToken.has(s.token)) {
      firstByToken.set(s.token, { result: s.result, lane: s.lane, scannedAtMs: s.scannedAtMs });
    }
  }

  const out: CheckinExportRow[] = [];

  for (const [token, info] of Array.from(firstByToken.entries())) {
    let resolved:
      | { firstName: string; lastName: string; laneNumber: number | null; teamNumber: string | null; sheetType: "banquet" | "pool" | "guest_pool" }
      | null = null;

    if (mode === "banquet") {
      const b = await rawQuery<{ legalFirstName: string; legalLastName: string; laneNumber: number | null; teamCode: string | null }>(
        `SELECT b.legalFirstName, b.legalLastName, b.laneNumber, t.teamCode
           FROM bowlers b LEFT JOIN teams t ON t.id = b.teamId
          WHERE b.banquetToken = ? LIMIT 1`,
        [token]
      );
      if (b[0]) {
        resolved = { firstName: b[0].legalFirstName, lastName: b[0].legalLastName, laneNumber: b[0].laneNumber, teamNumber: b[0].teamCode, sheetType: "banquet" };
      } else {
        const g = await rawQuery<{ legalFirstName: string; legalLastName: string; laneNumber: number | null; teamCode: string | null }>(
          `SELECT b.legalFirstName, b.legalLastName, b.laneNumber, t.teamCode
             FROM guest_pool_party_tokens g JOIN bowlers b ON b.id = g.bowlerId
             LEFT JOIN teams t ON t.id = b.teamId
            WHERE g.banquetToken = ? LIMIT 1`,
          [token]
        );
        if (g[0]) {
          resolved = { firstName: g[0].legalFirstName, lastName: g[0].legalLastName, laneNumber: g[0].laneNumber, teamNumber: g[0].teamCode, sheetType: "guest_pool" };
        }
      }
    } else {
      const b = await rawQuery<{ legalFirstName: string; legalLastName: string; laneNumber: number | null; teamCode: string | null }>(
        `SELECT b.legalFirstName, b.legalLastName, b.laneNumber, t.teamCode
           FROM bowlers b LEFT JOIN teams t ON t.id = b.teamId
          WHERE b.poolPartyToken = ? LIMIT 1`,
        [token]
      );
      if (b[0]) {
        resolved = { firstName: b[0].legalFirstName, lastName: b[0].legalLastName, laneNumber: b[0].laneNumber, teamNumber: b[0].teamCode, sheetType: "pool" };
      } else {
        const g = await rawQuery<{ legalFirstName: string; legalLastName: string; laneNumber: number | null; teamCode: string | null }>(
          `SELECT b.legalFirstName, b.legalLastName, b.laneNumber, t.teamCode
             FROM guest_pool_party_tokens g JOIN bowlers b ON b.id = g.bowlerId
             LEFT JOIN teams t ON t.id = b.teamId
            WHERE g.token = ? LIMIT 1`,
          [token]
        );
        if (g[0]) {
          resolved = { firstName: g[0].legalFirstName, lastName: g[0].legalLastName, laneNumber: g[0].laneNumber, teamNumber: g[0].teamCode, sheetType: "guest_pool" };
        }
      }
    }

    out.push({
      token,
      firstName: resolved?.firstName ?? "",
      lastName: resolved?.lastName ?? "",
      laneNumber: resolved?.laneNumber ?? null,
      teamNumber: resolved?.teamNumber ?? null,
      sheetType: resolved?.sheetType ?? (mode === "banquet" ? "banquet" : "pool"),
      scannedAtMs: info.scannedAtMs,
      result: info.result,
      isReentry: info.result === "reentry_admitted",
    });
  }

  // Sort by name for a predictable, sheet-friendly order.
  out.sort((a, b) =>
    (a.lastName + a.firstName).toLowerCase().localeCompare((b.lastName + b.firstName).toLowerCase())
  );
  return out;
}
