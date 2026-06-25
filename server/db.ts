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
