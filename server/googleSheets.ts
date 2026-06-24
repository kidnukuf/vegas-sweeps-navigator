/**
 * Google Sheets integration helper
 * Uses the gws CLI (Google Workspace CLI) which is pre-authenticated via the
 * Google Drive connector in Manus. No API keys or service account JSON needed.
 *
 * Sheet: "June 23 1152pm" (tab name as of 2026-06-23)
 * Spreadsheet ID: 1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM
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
 *   AI (34) = additional guest pool qr code used ← written on sign-up (suffix B used flag — treated as app-write per color)
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

import { execSync } from "child_process";

const SPREADSHEET_ID = "1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM";
const SHEET_NAME = "June 23 1152pm";

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

// ── gws helper ────────────────────────────────────────────────────────────────
function gws(params: object, body?: object): unknown {
  const args = ["gws", "sheets", "spreadsheets", "values"];
  if (body) {
    args.push("batchUpdate");
    args.push("--params", JSON.stringify({ spreadsheetId: SPREADSHEET_ID }));
    args.push("--json", JSON.stringify(body));
  } else {
    args.push("get");
    args.push("--params", JSON.stringify({ spreadsheetId: SPREADSHEET_ID, ...params }));
  }
  const result = execSync(args.join(" "), { encoding: "utf-8", timeout: 15000 });
  return JSON.parse(result);
}

/**
 * Find the 1-indexed sheet row for a bowler by first name, last name, and lane.
 * Returns null if not found.
 */
async function findBowlerRow(
  firstName: string,
  lastName: string,
  laneNumber: number | null
): Promise<number | null> {
  try {
    const data = gws({ range: `'${SHEET_NAME}'!A1:AJ` }) as { values?: string[][] };
    const rows = data.values ?? [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowFirst = (row[COL_FIRST_NAME] ?? "").trim().toLowerCase();
      const rowLast  = (row[COL_LAST_NAME]  ?? "").trim().toLowerCase();
      const rowLane  = parseInt(row[COL_LANE] ?? "0", 10);

      const nameMatch = rowFirst === firstName.trim().toLowerCase()
                     && rowLast  === lastName.trim().toLowerCase();
      const laneMatch = laneNumber == null || rowLane === laneNumber;

      if (nameMatch && laneMatch) return i + 1; // 1-indexed
    }
    return null;
  } catch (err) {
    console.error("[googleSheets] findBowlerRow error:", err);
    return null;
  }
}

// ── Public write-back functions ───────────────────────────────────────────────

/**
 * Write the Bowler ID (scantronId) into column A of the bowler's row.
 * Called immediately after import generates the ID for a new bowler.
 */
export async function writeBowlerIdToSheet(params: {
  firstName: string;
  lastName: string;
  laneNumber: number | null;
  scantronId: string;
}): Promise<void> {
  const { firstName, lastName, laneNumber, scantronId } = params;
  if (!scantronId) return;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber);
    if (!rowNum) {
      console.warn(`[googleSheets] writeBowlerIdToSheet: not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }
    gws({}, {
      valueInputOption: "RAW",
      data: [{ range: `'${SHEET_NAME}'!A${rowNum}`, values: [[scantronId]] }],
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
}): Promise<void> {
  const { firstName, lastName, laneNumber, banquetToken, poolPartyToken, guestPoolTokens = [], appOrigin } = params;

  const banquetQRUrl   = banquetToken   ? `${appOrigin}/scan/banquet/${banquetToken}`   : null;
  const poolPartyQRUrl = poolPartyToken ? `${appOrigin}/scan/pool/${poolPartyToken}`     : null;

  if (!banquetQRUrl && !poolPartyQRUrl && guestPoolTokens.length === 0) return;

  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber);
    if (!rowNum) {
      console.warn(`[googleSheets] writeQRCodesToSheet: not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }

    const updateData: { range: string; values: string[][] }[] = [];

    if (banquetQRUrl) {
      // AB (col 27) = Banquet QR URL
      updateData.push({ range: `'${SHEET_NAME}'!AB${rowNum}`, values: [[banquetQRUrl]] });
    }
    if (poolPartyQRUrl) {
      // AD (col 29) = Pool Party QR URL
      updateData.push({ range: `'${SHEET_NAME}'!AD${rowNum}`, values: [[poolPartyQRUrl]] });
    }

    // Guest pool QR URLs → AF (suffix A), AH (suffix B)
    for (let i = 0; i < Math.min(guestPoolTokens.length, GUEST_POOL_COLUMNS.length); i++) {
      const col = GUEST_POOL_COLUMNS[i];
      const guestUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[i].token}`;
      updateData.push({ range: `'${SHEET_NAME}'!${col}${rowNum}`, values: [[guestUrl]] });
    }

    // Also write Guest Pool Party QR URL to X (col 23) if first guest token exists
    if (guestPoolTokens.length > 0) {
      const guestPoolUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[0].token}`;
      updateData.push({ range: `'${SHEET_NAME}'!X${rowNum}`, values: [[guestPoolUrl]] });
    }

    if (updateData.length === 0) return;

    gws({}, { valueInputOption: "RAW", data: updateData });
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
}): Promise<{ rowNum: number | null }> {
  const { firstName, lastName, laneNumber, phone, email } = params;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber);
    if (!rowNum) {
      console.warn(`[googleSheets] writeContactInfo: not found: ${firstName} ${lastName}`);
      return { rowNum: null };
    }
    gws({}, {
      valueInputOption: "RAW",
      data: [
        { range: `'${SHEET_NAME}'!B${rowNum}`, values: [[phone]] },  // B = Phone
        { range: `'${SHEET_NAME}'!C${rowNum}`, values: [[email]] },  // C = Email
      ],
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
}): Promise<void> {
  const { firstName, lastName, laneNumber, type, timestamp = new Date().toISOString() } = params;
  const colMap: Record<string, string> = {
    banquet:    "AC",  // col 28 — banquet qr code used
    pool:       "AE",  // col 30 — Pool party entry confirmed
    guest_pool: "AG",  // col 32 — guest pool entry confirmed
  };
  const col = colMap[type];
  if (!col) return;
  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber);
    if (!rowNum) return;
    gws({}, {
      valueInputOption: "RAW",
      data: [{ range: `'${SHEET_NAME}'!${col}${rowNum}`, values: [[timestamp]] }],
    });
    console.log(`[googleSheets] Scan used (${type}) written for ${firstName} ${lastName} row ${rowNum}`);
  } catch (err) {
    console.error("[googleSheets] writeScanUsedToSheet error (non-fatal):", err);
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
