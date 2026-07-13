/**
 * Google Sheets integration helper
 *
 * Authentication: Google Service Account via the GOOGLE_SERVICE_ACCOUNT_JSON env var.
 * The value must be the full JSON content of a Google Cloud service account key file
 * (the file you download from Cloud Console → IAM → Service Accounts → Keys → Add Key).
 *
 * The service account must be granted "Editor" access to any spreadsheet it writes to.
 * No Manus connectors, no gws CLI, no personal OAuth — fully self-contained.
 *
 * Per-event sheet routing:
 *   Every event stores its own sheetSpreadsheetId + sheetTabName in the DB.
 *   These are saved automatically when the ED imports from a Google Sheets URL.
 *   All write-back functions accept an optional SheetTarget; when omitted the
 *   fallback values below are used (useful for legacy data or manual override).
 *
 * DEFINITIVE COLUMN LAYOUT (A=col 0, 0-indexed):
 *
 * 🟠 ORANGE — App writes these columns:
 *   A  (0)  = Bowler ID                       ← written on import
 *   B  (1)  = Phone                            ← written when ED confirms contact request
 *   C  (2)  = Email                            ← written when ED confirms contact request
 *   X  (23) = Guest Pool Party (QR URL)        ← written on sign-up
 *   Z  (25) = extra Guest banquet qr code      ← written on sign-up
 *   AB (27) = Banquet QR URL                   ← written on sign-up
 *   AD (29) = Pool Party QR URL                ← written on sign-up
 *   AF (31) = Guest pool qr code               ← written on sign-up (suffix A)
 *   AH (33) = additional guest pool qr code    ← written on sign-up (suffix B)
 *   AI (34) = additional guest pool qr code used ← written on sign-up (suffix B used flag)
 *   AJ (35) = guest banquet qr code            ← written on sign-up
 *
 * 🟣 PURPLE — ED supplies; app reads these columns:
 *   D  (3)  = Squad Day & Time
 *   E  (4)  = Lane #
 *   F  (5)  = Center
 *   G  (6)  = Team #
 *   H  (7)  = Captain
 *   I  (8)  = First Name
 *   J  (9)  = Last Name
 *   K  (10) = Under 21?
 *   N  (13) = Best Avg
 *   O  (14) = Team Name
 *   Q  (16) = T-Shirt Size
 *   R  (17) = Hotel Confirmation
 *   S  (18) = Check In
 *   T  (19) = Check Out
 *   U  (20) = Roommate First Name
 *   V  (21) = Roommate Last Name
 *   W  (22) = Hotel Registration #
 *
 * ⬜ WHITE — Doorman inserts when QR is used (app reads to check status):
 *   Y  (24) = guest pool qr code used
 *   AA (26) = extra banquet qr code used
 *   AC (28) = banquet qr code used
 *   AE (30) = Pool party entry confirmed
 *   AG (32) = guest pool entry confirmed
 *
 * ⬜ WHITE — Informational (no color, not parsed):
 *   L  (11) = Sanction #
 *   M  (12) = # Games
 *   P  (15) = League Member
 */

import { google } from "googleapis";
import { rawQuery, rawExec } from "./db";

// ── App-Settings helpers ──────────────────────────────────────────────────────
export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const rows = await rawQuery<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
      [key]
    );
    return rows[0]?.setting_value ?? null;
  } catch {
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await rawExec(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)`,
    [key, value, Date.now()]
  );
}

export async function deleteAppSetting(key: string): Promise<void> {
  await rawExec("DELETE FROM app_settings WHERE setting_key = ?", [key]);
}

// ── Fallback sheet target ─────────────────────────────────────────────────────
// These are used ONLY when an event has no sheet target saved yet.
// New operators should set their own sheet via the Event Settings UI or by
// importing from a Google Sheets URL — that auto-saves the target.
// Leave blank so write-backs silently no-op until the ED links a sheet.
const FALLBACK_SPREADSHEET_ID = "";
const FALLBACK_SHEET_NAME = "";

/**
 * Per-event sheet target. Each event can point at its own spreadsheet file and tab.
 * When a field is missing the fallback above is used so existing flows never break.
 */
export type SheetTarget = {
  spreadsheetId?: string | null;
  sheetName?: string | null;
};

/**
 * Extract a bare spreadsheet ID from either a full Google Sheets URL or a bare ID string.
 * e.g. "https://docs.google.com/spreadsheets/d/ABCDEF/edit" → "ABCDEF"
 *      "ABCDEF" → "ABCDEF"
 */
function extractSpreadsheetId(value: string): string {
  const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : value;
}

/** Resolve an event's sheet target to concrete values, falling back to the master default. */
export function resolveSheetTarget(target?: SheetTarget): { spreadsheetId: string; sheetName: string } {
  const rawId = (target?.spreadsheetId && target.spreadsheetId.trim()) || FALLBACK_SPREADSHEET_ID;
  return {
    spreadsheetId: rawId ? extractSpreadsheetId(rawId) : "",
    sheetName: (target?.sheetName && target.sheetName.trim()) || FALLBACK_SHEET_NAME,
  };
}

// ── Column indices (0-based) ──────────────────────────────────────────────────
// 🟠 App writes
const COL_BOWLER_ID        = 0;   // A
const COL_PHONE            = 1;   // B
const COL_EMAIL            = 2;   // C
const COL_GUEST_POOL_QR    = 23;  // X  — Guest Pool Party QR URL
const COL_EXTRA_BANQUET_QR = 25;  // Z  — extra Guest banquet qr code
const COL_BANQUET_QR       = 27;  // AB — Banquet QR URL
const COL_POOL_QR          = 29;  // AD — Pool Party QR URL
const COL_GUEST_POOL_A     = 31;  // AF — Guest pool qr code (suffix A)
const COL_GUEST_POOL_B     = 33;  // AH — additional guest pool qr code (suffix B)
const COL_GUEST_BANQUET_QR = 35;  // AJ — guest banquet qr code
// 🟣 App reads
const COL_SQUAD_TIME       = 3;   // D
const COL_LANE             = 4;   // E
const COL_CENTER           = 5;   // F
const COL_TEAM_CODE        = 6;   // G
const COL_CAPTAIN          = 7;   // H
const COL_FIRST_NAME       = 8;   // I
const COL_LAST_NAME        = 9;   // J
const COL_UNDER_21         = 10;  // K
const COL_BEST_AVG         = 13;  // N
const COL_TEAM_NAME        = 14;  // O
const COL_SHIRT_SIZE       = 16;  // Q
const COL_HOTEL_CONF       = 17;  // R
const COL_CHECK_IN         = 18;  // S
const COL_CHECK_OUT        = 19;  // T
const COL_ROOMMATE_FIRST   = 20;  // U
const COL_ROOMMATE_LAST    = 21;  // V
const COL_HOTEL_REG        = 22;  // W — Hotel Registration #
// ⬜ Doorman writes (app reads for status checks)
const COL_GUEST_POOL_USED  = 24;  // Y  — guest pool qr code used
const COL_EXTRA_BNQ_USED   = 26;  // AA — extra banquet qr code used
const COL_BANQUET_USED     = 28;  // AC — banquet qr code used
const COL_POOL_CONFIRMED   = 30;  // AE — Pool party entry confirmed
const COL_GUEST_POOL_CONF  = 32;  // AG — guest pool entry confirmed

// Suppress unused-variable warnings for read-only constants used by other modules
void COL_SQUAD_TIME; void COL_CENTER; void COL_TEAM_CODE; void COL_CAPTAIN;
void COL_UNDER_21; void COL_BEST_AVG; void COL_TEAM_NAME; void COL_SHIRT_SIZE;
void COL_HOTEL_CONF; void COL_CHECK_IN; void COL_CHECK_OUT;
void COL_ROOMMATE_FIRST; void COL_ROOMMATE_LAST; void COL_HOTEL_REG;
void COL_GUEST_POOL_USED; void COL_EXTRA_BNQ_USED; void COL_BANQUET_USED;
void COL_POOL_CONFIRMED; void COL_GUEST_POOL_CONF;
void COL_EXTRA_BANQUET_QR; void COL_GUEST_BANQUET_QR;
void COL_GUEST_POOL_B;

// Column letters for guest pool QR write-back (AF, AH = suffix A, B)
const GUEST_POOL_COLUMNS = ["AF", "AH"];

// 🔴 RED-PINK — App writes survey answers (AR, AT, AV, AX, AZ, BB, BD, BF, BH, BJ)
// Pattern: AQ=Q1, AR=A1, AS=Q2, AT=A2, AU=Q3, AV=A3, AW=Q4, AX=A4, AY=Q5, AZ=A5,
//          BA=Q6, BB=A6, BC=Q7, BD=A7, BE=Q8, BF=A8, BG=Q9, BH=A9, BI=Q10, BJ=A10
const COL_Q1_ANSWER     = 43;  // AR
const COL_Q2_ANSWER     = 45;  // AT
const COL_Q3_ANSWER     = 47;  // AV
const COL_Q4_ANSWER     = 49;  // AX
const COL_Q5_ANSWER     = 51;  // AZ
const COL_Q6_ANSWER     = 53;  // BB
const COL_Q7_ANSWER     = 55;  // BD
const COL_Q8_ANSWER     = 57;  // BF
const COL_Q9_ANSWER     = 59;  // BH
const COL_Q10_ANSWER    = 61;  // BJ

// ── googleapis auth ───────────────────────────────────────────────────────────
/**
 * Build an authenticated Google Sheets API client.
 * Credential resolution order:
 *   1. app_settings DB row  (set by the ED in-app — preferred for sold deployments)
 *   2. GOOGLE_SERVICE_ACCOUNT_JSON env var  (fallback for dev / Manus Secrets)
 * Returns null (with a warning) if neither source is available.
 */
async function getSheetsClient() {
  // 1. Try DB-stored credentials first
  let raw: string | null = null;
  try {
    raw = await getAppSetting("google_service_account_json");
  } catch {
    // DB unavailable — fall through to env
  }
  // 2. Fall back to env var
  if (!raw) raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? null;

  if (!raw) {
    console.warn("[googleSheets] No Google credentials found (DB or env) — sheet write-backs disabled");
    return null;
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    console.warn("[googleSheets] Google credentials JSON is invalid — sheet write-backs disabled");
    return null;
  }
  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return google.sheets({ version: "v4", auth });
  } catch (err) {
    console.warn("[googleSheets] Failed to initialise Google auth:", err);
    return null;
  }
}

// ── Row finder ────────────────────────────────────────────────────────────────
/**
 * Find the 1-indexed sheet row for a bowler by first name, last name, and lane.
 * Returns null if not found or if the sheet client is unavailable.
 */
async function findBowlerRow(
  firstName: string,
  lastName: string,
  laneNumber: number | null,
  resolved: { spreadsheetId: string; sheetName: string }
): Promise<number | null> {
  if (!resolved.spreadsheetId || !resolved.sheetName) return null;
  const sheets = await getSheetsClient();
  if (!sheets) return null;
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: resolved.spreadsheetId,
      range: `'${resolved.sheetName}'!A1:AJ`,
    });
    const rows = resp.data.values ?? [];
    const fn = firstName.toLowerCase().trim();
    const ln = lastName.toLowerCase().trim();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowFirst = (row[COL_FIRST_NAME] ?? "").toLowerCase().trim();
      const rowLast  = (row[COL_LAST_NAME]  ?? "").toLowerCase().trim();
      if (rowFirst !== fn || rowLast !== ln) continue;
      if (laneNumber !== null) {
        const rowLane = parseInt(row[COL_LANE] ?? "", 10);
        if (!isNaN(rowLane) && rowLane !== laneNumber) continue;
      }
      return i + 1; // 1-indexed
    }
    return null;
  } catch (err) {
    console.error("[googleSheets] findBowlerRow error:", err);
    return null;
  }
}

// ── Exported write-back functions ─────────────────────────────────────────────

/**
 * Write the generated Bowler ID (scantron ID) into column A of the bowler's row.
 * Called during import for every bowler that gets a new ID.
 */
export async function writeBowlerIdToSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  scantronId: string;
  target?: SheetTarget;
}): Promise<void> {
  const { firstName, lastName, laneNumber, scantronId, target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) {
      console.warn(`[googleSheets] writeBowlerIdToSheet: not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: resolved.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [{ range: `'${resolved.sheetName}'!A${rowNum}`, values: [[scantronId]] }],
      },
    });
    console.log(`[googleSheets] Bowler ID ${scantronId} → row ${rowNum} (${firstName} ${lastName})`);
  } catch (err) {
    console.error("[googleSheets] writeBowlerIdToSheet error (non-fatal):", err);
  }
}

/**
 * Write Banquet QR URL (AB), Pool Party QR URL (AD), and guest pool QR URLs
 * (AF, AH) into the bowler's row immediately after sign-up.
 */
export async function writeQRCodesToSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  banquetToken: string | null;
  poolPartyToken: string | null;
  guestPoolTokens?: Array<{ suffix: string; token: string }>;
  appOrigin: string;
  target?: SheetTarget;
}): Promise<void> {
  const { firstName, lastName, laneNumber, banquetToken, poolPartyToken, guestPoolTokens = [], appOrigin, target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;

  const banquetQRUrl   = banquetToken   ? `${appOrigin}/scan/banquet/${banquetToken}`   : null;
  const poolPartyQRUrl = poolPartyToken ? `${appOrigin}/scan/pool/${poolPartyToken}`     : null;
  if (!banquetQRUrl && !poolPartyQRUrl && guestPoolTokens.length === 0) return;

  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) {
      console.warn(`[googleSheets] writeQRCodesToSheet: not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }
    const updateData: { range: string; values: string[][] }[] = [];
    if (banquetQRUrl) {
      updateData.push({ range: `'${resolved.sheetName}'!AB${rowNum}`, values: [[banquetQRUrl]] });
    }
    if (poolPartyQRUrl) {
      updateData.push({ range: `'${resolved.sheetName}'!AD${rowNum}`, values: [[poolPartyQRUrl]] });
    }
    for (let i = 0; i < Math.min(guestPoolTokens.length, GUEST_POOL_COLUMNS.length); i++) {
      const col = GUEST_POOL_COLUMNS[i];
      const guestUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[i].token}`;
      updateData.push({ range: `'${resolved.sheetName}'!${col}${rowNum}`, values: [[guestUrl]] });
    }
    if (guestPoolTokens.length > 0) {
      const guestPoolUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[0].token}`;
      updateData.push({ range: `'${resolved.sheetName}'!X${rowNum}`, values: [[guestPoolUrl]] });
    }
    if (updateData.length === 0) return;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: resolved.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updateData },
    });
    console.log(`[googleSheets] QR URLs written for ${firstName} ${lastName} (row ${rowNum}, ${guestPoolTokens.length} guest codes)`);
  } catch (err) {
    console.error("[googleSheets] writeQRCodesToSheet error (non-fatal):", err);
  }
}

/**
 * Write phone (B) and email (C) when the Event Director confirms a contact request.
 */
export async function writeContactInfoToSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  phone: string;
  email: string;
  target?: SheetTarget;
}): Promise<{ rowNum: number | null }> {
  const { firstName, lastName, laneNumber, phone, email, target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return { rowNum: null };
  const sheets = await getSheetsClient();
  if (!sheets) return { rowNum: null };
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) {
      console.warn(`[googleSheets] writeContactInfo: not found: ${firstName} ${lastName}`);
      return { rowNum: null };
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: resolved.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `'${resolved.sheetName}'!B${rowNum}`, values: [[phone]] },
          { range: `'${resolved.sheetName}'!C${rowNum}`, values: [[email]] },
        ],
      },
    });
    console.log(`[googleSheets] Contact info written for ${firstName} ${lastName} (row ${rowNum})`);
    return { rowNum };
  } catch (err) {
    console.error("[googleSheets] writeContactInfoToSheet error:", err);
    return { rowNum: null };
  }
}

/**
 * Write the doorman scan timestamp into the appropriate "used" column when a QR is redeemed.
 * type: "banquet" → AC, "pool" → AE, "guest_pool" → AG
 */
export async function writeScanUsedToSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  type: "banquet" | "pool" | "guest_pool";
  timestamp?: string;
  target?: SheetTarget;
}): Promise<void> {
  const { firstName, lastName, laneNumber, type, timestamp = new Date().toISOString(), target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;
  const colMap: Record<string, string> = {
    banquet:    "AC",
    pool:       "AE",
    guest_pool: "AG",
  };
  const col = colMap[type];
  if (!col) return;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) return;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: resolved.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [{ range: `'${resolved.sheetName}'!${col}${rowNum}`, values: [[timestamp]] }],
      },
    });
    console.log(`[googleSheets] Scan used (${type}) written for ${firstName} ${lastName} row ${rowNum}`);
  } catch (err) {
    console.error("[googleSheets] writeScanUsedToSheet error (non-fatal):", err);
  }
}

// ── Numeric sheet gid cache (for formatting requests) ─────────────────────────
const _cachedSheetIds = new Map<string, number | null>();

async function getSheetId(resolved: { spreadsheetId: string; sheetName: string }): Promise<number | null> {
  const cacheKey = `${resolved.spreadsheetId}::${resolved.sheetName}`;
  if (_cachedSheetIds.has(cacheKey)) return _cachedSheetIds.get(cacheKey) ?? null;
  const sheets = await getSheetsClient();
  if (!sheets) return null;
  try {
    const resp = await sheets.spreadsheets.get({
      spreadsheetId: resolved.spreadsheetId,
      fields: "sheets.properties",
    });
    const match = (resp.data.sheets ?? []).find((s) => s.properties?.title === resolved.sheetName);
    const sheetId = match?.properties?.sheetId ?? null;
    _cachedSheetIds.set(cacheKey, sheetId ?? null);
    return sheetId ?? null;
  } catch (err) {
    console.error("[googleSheets] getSheetId error:", err);
    return null;
  }
}

/**
 * Mark a captain's T-shirt batch as received by turning their First Name cell
 * (column I) background purple. Fire-and-forget; non-fatal on failure.
 */
export async function markTshirtReceivedInSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  received?: boolean;
  target?: SheetTarget;
}): Promise<void> {
  const { firstName, lastName, laneNumber, received = true, target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) return;
    const sheetId = await getSheetId(resolved);
    if (sheetId === null) return;
    const color = received
      ? { red: 0.61, green: 0.35, blue: 0.71 }
      : { red: 1, green: 1, blue: 1 };
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: resolved.spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: rowNum - 1,
                endRowIndex: rowNum,
                startColumnIndex: COL_FIRST_NAME,
                endColumnIndex: COL_FIRST_NAME + 1,
              },
              cell: { userEnteredFormat: { backgroundColor: color } },
              fields: "userEnteredFormat.backgroundColor",
            },
          },
        ],
      },
    });
    console.log(`[googleSheets] T-shirt ${received ? "received" : "reset"} color for ${firstName} ${lastName} row ${rowNum}`);
  } catch (err) {
    console.error("[googleSheets] markTshirtReceivedInSheet error (non-fatal):", err);
  }
}

/**
 * Write survey responses to the bowler's row in the Google Sheet.
 * Writes Q1-Q10 responses to red-pink columns (AR, AT, AV, AX, AZ, BB, BD, BF, BH, BJ).
 * Called after a bowler submits their survey in the portal.
 */
export async function writeSurveyToSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  q1Rating?: number | null;
  q2Rating?: number | null;
  q3Rating?: number | null;
  q4Rating?: number | null;
  q5Rating?: number | null;
  q6Rating?: number | null;
  q7Rating?: number | null;
  q8Comment?: string | null;
  q9Rating?: number | null;
  q10Rating?: number | null;
  target?: SheetTarget;
}): Promise<void> {
  const { firstName, lastName, laneNumber, target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) {
      console.warn(`[googleSheets] writeSurveyToSheet: not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }
    // Build the update data: all 10 question answers go into AR, AT, AV, AX, AZ, BB, BD, BF, BH, BJ
    const updates = [
      { range: `'${resolved.sheetName}'!AR${rowNum}`, values: [[params.q1Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!AT${rowNum}`, values: [[params.q2Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!AV${rowNum}`, values: [[params.q3Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!AX${rowNum}`, values: [[params.q4Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!AZ${rowNum}`, values: [[params.q5Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!BB${rowNum}`, values: [[params.q6Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!BD${rowNum}`, values: [[params.q7Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!BF${rowNum}`, values: [[params.q8Comment ?? ""]] },
      { range: `'${resolved.sheetName}'!BH${rowNum}`, values: [[params.q9Rating ?? ""]] },
      { range: `'${resolved.sheetName}'!BJ${rowNum}`, values: [[params.q10Rating ?? ""]] },
    ];
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: resolved.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    });
    console.log(`[googleSheets] Survey ratings written → row ${rowNum} (${firstName} ${lastName})`);
  } catch (err) {
    console.error("[googleSheets] writeSurveyToSheet error (non-fatal):", err);
  }
}

/**
 * Normalize squad time codes to human-readable labels.
 */
export function normalizeSquadTime(raw: string | null): string {
  if (!raw) return "";
  const map: Record<string, string> = {
    M3:  "Monday 3pm",
    M10: "Monday 10am",
    T10: "Tuesday 10am",
  };
  return map[raw.trim().toUpperCase()] ?? raw;
}

// Export column index constants for use in other modules
export const SHEET_COLS = {
  BOWLER_ID:        COL_BOWLER_ID,
  PHONE:            COL_PHONE,
  EMAIL:            COL_EMAIL,
  SQUAD_TIME:       COL_SQUAD_TIME,
  LANE:             COL_LANE,
  CENTER:           COL_CENTER,
  TEAM_CODE:        COL_TEAM_CODE,
  CAPTAIN:          COL_CAPTAIN,
  FIRST_NAME:       COL_FIRST_NAME,
  LAST_NAME:        COL_LAST_NAME,
  UNDER_21:         COL_UNDER_21,
  BEST_AVG:         COL_BEST_AVG,
  TEAM_NAME:        COL_TEAM_NAME,
  SHIRT_SIZE:       COL_SHIRT_SIZE,
  HOTEL_CONF:       COL_HOTEL_CONF,
  CHECK_IN:         COL_CHECK_IN,
  CHECK_OUT:        COL_CHECK_OUT,
  ROOMMATE_FIRST:   COL_ROOMMATE_FIRST,
  ROOMMATE_LAST:    COL_ROOMMATE_LAST,
  HOTEL_REG:        COL_HOTEL_REG,
  GUEST_POOL_QR:    COL_GUEST_POOL_QR,
  EXTRA_BANQUET_QR: COL_EXTRA_BANQUET_QR,
  BANQUET_QR:       COL_BANQUET_QR,
  POOL_QR:          COL_POOL_QR,
  GUEST_POOL_A:     COL_GUEST_POOL_A,
  GUEST_POOL_B:     COL_GUEST_POOL_B,
  GUEST_BANQUET_QR: COL_GUEST_BANQUET_QR,
  GUEST_POOL_USED:  COL_GUEST_POOL_USED,
  EXTRA_BNQ_USED:   COL_EXTRA_BNQ_USED,
  BANQUET_USED:     COL_BANQUET_USED,
  POOL_CONFIRMED:   COL_POOL_CONFIRMED,
  GUEST_POOL_CONF:  COL_GUEST_POOL_CONF,
};
