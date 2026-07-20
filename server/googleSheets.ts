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
 * DEFINITIVE COLUMN LAYOUT — matches permanent sheet 1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM
 * (A=col 0, 0-indexed)
 *
 * 🟠 ORANGE — App writes these columns:
 *   A  (0)  = Bowler ID                         ← written on import
 *   B  (1)  = Phone                              ← written when ED confirms contact request
 *   C  (2)  = Email                              ← written when ED confirms contact request
 *   Z  (25) = Pool QR URL                        ← written on sign-up
 *   AB (27) = Banquet QR URL                     ← written on sign-up
 *   AD (29) = #A Pool QR (guest suffix A)        ← written on sign-up
 *   AF (31) = #A Banquet QR (guest suffix A)     ← written on sign-up
 *   AH (33) = #B Pool QR (guest suffix B)        ← written on sign-up
 *   AJ (35) = #B Banquet QR (guest suffix B)     ← written on sign-up
 *   AL (37) = 2nd Banquet QR                     ← written on sign-up (2nd event)
 *   AN (39) = 2nd Pool QR                        ← written on sign-up (2nd event)
 *
 * 🟣 PURPLE — ED supplies; app reads these columns:
 *   D  (3)  = Squad Day & Time
 *   E  (4)  = Lane #
 *   F  (5)  = Center
 *   G  (6)  = Coordinator
 *   H  (7)  = Team #
 *   I  (8)  = Captain
 *   J  (9)  = First Name
 *   K  (10) = Last Name
 *   L  (11) = Under 21?
 *   O  (14) = Best Avg
 *   P  (15) = Team Name
 *   R  (17) = T-Shirt Size
 *   S  (18) = Hotel Confirmation
 *   T  (19) = Check In
 *   U  (20) = Check Out
 *   V  (21) = Roommate First Name
 *   W  (22) = Roommate Last Name
 *   X  (23) = 2nd Squad Time
 *   Y  (24) = Lane # (2nd)
 *
 * ⬜ WHITE — Doorman inserts when QR is used (app reads to check status):
 *   AA (26) = Pool Used
 *   AC (28) = Banquet Used
 *   AE (30) = #A Pool Used
 *   AG (32) = #A Banquet Used
 *   AI (34) = #B Pool Used
 *   AK (36) = #B Banquet Used
 *   AM (38) = 2nd Banquet Used
 *   AO (40) = 2nd Pool Used
 *
 * 🔴 RED-PINK — Survey (app writes answers; ED pre-fills questions):
 *   AP (41) = Q1 Overall Experience? (question)
 *   AQ (42) = Q1 answer              (app writes)
 *   AR (43) = Q2 Bowling Venue?      (question)
 *   AS (44) = Q2 Answer              (app writes)
 *   AT (45) = Q3 Event Organization? (question)
 *   AU (46) = Q3 Answer              (app writes)
 *   AV (47) = Q4 Pool Party?         (question)
 *   AW (48) = Q4 Answer              (app writes)
 *   AX (49) = Q5 Banquet Experience? (question)
 *   AY (50) = Q5 Answer              (app writes)
 *   AZ (51) = Q6 This App?           (question)
 *   BA (52) = Q6 Answer              (app writes)
 *   BB (53) = Q7 League App Interest?(question)
 *   BC (54) = Q7 Answer              (app writes)
 *   BD (55) = Q8 Additional Comments (question)
 *   BE (56) = Q8 Answer              (app writes)
 *   BF (57) = Q9 Testimonial Perm?   (question)
 *   BG (58) = Q9 Answer              (app writes)
 *   BH (59) = Q10 Attend Next Year?  (question)
 *   BI (60) = Q10 Answer             (app writes)
 *
 * ⬜ WHITE — Informational (no color, not parsed):
 *   M  (12) = Sanction #
 *   N  (13) = # Games
 *   Q  (16) = League Member
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
// Exact column layout from the permanent Google Sheet (1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM)
// Row 1 headers (A=0 through BI=60):
//  A(0)  Bowler ID          B(1)  Phone              C(2)  Email
//  D(3)  Squad Day & Time   E(4)  Lane #             F(5)  Center
//  G(6)  Coordinator        H(7)  Team #             I(8)  Captain
//  J(9)  First Name         K(10) Last Name          L(11) Under 21?
//  M(12) Sanction #         N(13) # Games            O(14) Best Avg
//  P(15) Team Name          Q(16) League Member      R(17) T-Shirt Size
//  S(18) Hotel Confirmation T(19) Check In           U(20) Check Out
//  V(21) Roommate First Name W(22) Roommate Last Name X(23) 2nd Squad Time
//  Y(24) Lane # (2nd)       Z(25) Pool QR            AA(26) Pool Used
//  AB(27) Banquet QR        AC(28) Banquet Used       AD(29) #A Pool QR
//  AE(30) #A Pool Used      AF(31) #A Banquet QR      AG(32) #A Banquet Used
//  AH(33) #B Pool QR        AI(34) #B Pool Used       AJ(35) #B Banquet QR
//  AK(36) #B Banquet Used   AL(37) 2nd Banquet QR     AM(38) 2nd Banquet Used
//  AN(39) 2nd Pool QR       AO(40) 2nd Pool Used      AP(41) Q1 Overall Experience?
//  AQ(42) Q1 answer         AR(43) Q2 Bowling Venue?  AS(44) Q2 Answer
//  AT(45) Q3 Event Organization? AU(46) Q3 Answer     AV(47) Q4 Pool Party?
//  AW(48) Q4 Answer         AX(49) Q5 Banquet Experience? AY(50) Q5 Answer
//  AZ(51) Q6 This App?      BA(52) Q6 Answer          BB(53) Q7 League App Interest?
//  BC(54) Q7 Answer         BD(55) Q8 Additional Comments BE(56) Q8 Answer
//  BF(57) Q9 Testimonial Permission? BG(58) Q9 Answer BH(59) Q10 Attend Next Year?
//  BI(60) Q10 Answer

// 🟠 App writes
const COL_BOWLER_ID        = 0;   // A  — Bowler ID
const COL_PHONE            = 1;   // B  — Phone
const COL_EMAIL            = 2;   // C  — Email
// 🟣 App reads (ED-supplied)
const COL_SQUAD_TIME       = 3;   // D  — Squad Day & Time
const COL_LANE             = 4;   // E  — Lane #
const COL_CENTER           = 5;   // F  — Center
const COL_COORDINATOR      = 6;   // G  — Coordinator
const COL_TEAM_CODE        = 7;   // H  — Team #
const COL_CAPTAIN          = 8;   // I  — Captain
const COL_FIRST_NAME       = 9;   // J  — First Name
const COL_LAST_NAME        = 10;  // K  — Last Name
const COL_UNDER_21         = 11;  // L  — Under 21?
const COL_SANCTION_NUM     = 12;  // M  — Sanction #
const COL_NUM_GAMES        = 13;  // N  — # Games
const COL_BEST_AVG         = 14;  // O  — Best Avg
const COL_TEAM_NAME        = 15;  // P  — Team Name
const COL_LEAGUE_MEMBER    = 16;  // Q  — League Member
const COL_SHIRT_SIZE       = 17;  // R  — T-Shirt Size
const COL_HOTEL_CONF       = 18;  // S  — Hotel Confirmation
const COL_CHECK_IN         = 19;  // T  — Check In
const COL_CHECK_OUT        = 20;  // U  — Check Out
const COL_ROOMMATE_FIRST   = 21;  // V  — Roommate First Name
const COL_ROOMMATE_LAST    = 22;  // W  — Roommate Last Name
const COL_SQUAD_TIME_2     = 23;  // X  — 2nd Squad Time
const COL_LANE_2           = 24;  // Y  — Lane # (2nd)
// 🟠 App writes — QR codes
const COL_POOL_QR          = 25;  // Z  — Pool QR
const COL_POOL_USED        = 26;  // AA — Pool Used  (doorman writes; app reads)
const COL_BANQUET_QR       = 27;  // AB — Banquet QR
const COL_BANQUET_USED     = 28;  // AC — Banquet Used  (doorman writes; app reads)
const COL_GUEST_POOL_A     = 29;  // AD — #A Pool QR
const COL_GUEST_POOL_A_USED = 30; // AE — #A Pool Used  (doorman writes; app reads)
const COL_GUEST_BANQUET_A  = 31;  // AF — #A Banquet QR
const COL_GUEST_BANQUET_A_USED = 32; // AG — #A Banquet Used  (doorman writes; app reads)
const COL_GUEST_POOL_B     = 33;  // AH — #B Pool QR
const COL_GUEST_POOL_B_USED = 34; // AI — #B Pool Used  (doorman writes; app reads)
const COL_GUEST_BANQUET_B  = 35;  // AJ — #B Banquet QR
const COL_GUEST_BANQUET_B_USED = 36; // AK — #B Banquet Used  (doorman writes; app reads)
const COL_EXTRA_BANQUET_QR = 37;  // AL — 2nd Banquet QR
const COL_EXTRA_BNQ_USED   = 38;  // AM — 2nd Banquet Used  (doorman writes; app reads)
const COL_EXTRA_POOL_QR    = 39;  // AN — 2nd Pool QR
const COL_EXTRA_POOL_USED  = 40;  // AO — 2nd Pool Used  (doorman writes; app reads)
// Survey columns (app reads question text; app writes answer)
const COL_Q1_QUESTION   = 41;  // AP — Q1 Overall Experience?
const COL_Q1_ANSWER     = 42;  // AQ — Q1 answer
const COL_Q2_QUESTION   = 43;  // AR — Q2 Bowling Venue?
const COL_Q2_ANSWER     = 44;  // AS — Q2 Answer
const COL_Q3_QUESTION   = 45;  // AT — Q3 Event Organization?
const COL_Q3_ANSWER     = 46;  // AU — Q3 Answer
const COL_Q4_QUESTION   = 47;  // AV — Q4 Pool Party?
const COL_Q4_ANSWER     = 48;  // AW — Q4 Answer
const COL_Q5_QUESTION   = 49;  // AX — Q5 Banquet Experience?
const COL_Q5_ANSWER     = 50;  // AY — Q5 Answer
const COL_Q6_QUESTION   = 51;  // AZ — Q6 This App?
const COL_Q6_ANSWER     = 52;  // BA — Q6 Answer
const COL_Q7_QUESTION   = 53;  // BB — Q7 League App Interest?
const COL_Q7_ANSWER     = 54;  // BC — Q7 Answer
const COL_Q8_QUESTION   = 55;  // BD — Q8 Additional Comments
const COL_Q8_ANSWER     = 56;  // BE — Q8 Answer
const COL_Q9_QUESTION   = 57;  // BF — Q9 Testimonial Permission?
const COL_Q9_ANSWER     = 58;  // BG — Q9 Answer
const COL_Q10_QUESTION  = 59;  // BH — Q10 Attend Next Year?
const COL_Q10_ANSWER    = 60;  // BI — Q10 Answer

// Suppress unused-variable warnings for read-only constants used by other modules
void COL_SQUAD_TIME; void COL_CENTER; void COL_COORDINATOR; void COL_TEAM_CODE; void COL_CAPTAIN;
void COL_UNDER_21; void COL_BEST_AVG; void COL_TEAM_NAME; void COL_SHIRT_SIZE;
void COL_CHECK_IN; void COL_CHECK_OUT;
void COL_ROOMMATE_FIRST; void COL_ROOMMATE_LAST; void COL_HOTEL_CONF;
void COL_SANCTION_NUM; void COL_NUM_GAMES; void COL_LEAGUE_MEMBER;
void COL_SQUAD_TIME_2; void COL_LANE_2;
void COL_POOL_USED; void COL_EXTRA_BANQUET_QR; void COL_EXTRA_BNQ_USED;
void COL_BANQUET_USED; void COL_GUEST_POOL_A_USED; void COL_GUEST_POOL_B_USED;
void COL_GUEST_BANQUET_A_USED; void COL_GUEST_BANQUET_B_USED;
void COL_EXTRA_POOL_QR; void COL_EXTRA_POOL_USED;
void COL_Q1_QUESTION; void COL_Q2_QUESTION; void COL_Q3_QUESTION; void COL_Q4_QUESTION;
void COL_Q5_QUESTION; void COL_Q6_QUESTION; void COL_Q7_QUESTION; void COL_Q8_QUESTION;
void COL_Q9_QUESTION; void COL_Q10_QUESTION;

// Column letters for guest pool QR write-back (AD, AH = suffix A, B)
const GUEST_POOL_COLUMNS = ["AD", "AH"];
// Column letters for guest banquet QR write-back (AF, AJ = suffix A, B)
const GUEST_BANQUET_COLUMNS = ["AF", "AJ"];

// ── googleapis auth ───────────────────────────────────────────────────────────
/**
 * Build an authenticated Google Sheets API client.
 * Credential resolution order:
 *   1. app_settings DB row  (set by the ED in-app — preferred for sold deployments)
 *   2. GOOGLE_SERVICE_ACCOUNT_JSON env var  (fallback for dev / Manus Secrets)
 * Returns null (with a warning) if neither source is available.
 */
export async function getSheetsClient() {
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
  guestBanquetTokens?: Array<{ suffix: string; banquetToken: string }>;
  appOrigin: string;
  target?: SheetTarget;
}): Promise<void> {
  const { firstName, lastName, laneNumber, banquetToken, poolPartyToken, guestPoolTokens = [], guestBanquetTokens = [], appOrigin, target } = params;
  const resolved = resolveSheetTarget(target);
  if (!resolved.spreadsheetId || !resolved.sheetName) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;

  const banquetQRUrl   = banquetToken   ? `${appOrigin}/scan/banquet/${banquetToken}`   : null;
  const poolPartyQRUrl = poolPartyToken ? `${appOrigin}/scan/pool/${poolPartyToken}`     : null;
  if (!banquetQRUrl && !poolPartyQRUrl && guestPoolTokens.length === 0 && guestBanquetTokens.length === 0) return;

  try {
    const rowNum = await findBowlerRow(firstName, lastName, laneNumber, resolved);
    if (!rowNum) {
      console.warn(`[googleSheets] writeQRCodesToSheet: not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }
    const updateData: { range: string; values: string[][] }[] = [];
    if (banquetQRUrl) {
      // AB (index 27) = Banquet QR
      updateData.push({ range: `'${resolved.sheetName}'!AB${rowNum}`, values: [[banquetQRUrl]] });
    }
    if (poolPartyQRUrl) {
      // Z (index 25) = Pool QR
      updateData.push({ range: `'${resolved.sheetName}'!Z${rowNum}`, values: [[poolPartyQRUrl]] });
    }
    for (let i = 0; i < Math.min(guestPoolTokens.length, GUEST_POOL_COLUMNS.length); i++) {
      const col = GUEST_POOL_COLUMNS[i]; // AD=#A Pool QR, AH=#B Pool QR
      const guestUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[i].token}`;
      updateData.push({ range: `'${resolved.sheetName}'!${col}${rowNum}`, values: [[guestUrl]] });
    }
    for (let i = 0; i < Math.min(guestBanquetTokens.length, GUEST_BANQUET_COLUMNS.length); i++) {
      const col = GUEST_BANQUET_COLUMNS[i]; // AF=#A Banquet QR, AJ=#B Banquet QR
      const guestBanquetUrl = `${appOrigin}/scan/guest-banquet/${guestBanquetTokens[i].banquetToken}`;
      updateData.push({ range: `'${resolved.sheetName}'!${col}${rowNum}`, values: [[guestBanquetUrl]] });
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
    banquet:    "AC",  // AC (index 28) = Banquet Used
    pool:       "AA",  // AA (index 26) = Pool Used
    guest_pool: "AE",  // AE (index 30) = #A Pool Used
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
    // Build the update data: answers go into AQ, AS, AU, AW, AY, BA, BC, BE, BG, BI
    // (each answer column is immediately after its question column)
    const updates = [
      { range: `'${resolved.sheetName}'!AQ${rowNum}`, values: [[params.q1Rating ?? ""]] },  // AQ = Q1 answer
      { range: `'${resolved.sheetName}'!AS${rowNum}`, values: [[params.q2Rating ?? ""]] },  // AS = Q2 Answer
      { range: `'${resolved.sheetName}'!AU${rowNum}`, values: [[params.q3Rating ?? ""]] },  // AU = Q3 Answer
      { range: `'${resolved.sheetName}'!AW${rowNum}`, values: [[params.q4Rating ?? ""]] },  // AW = Q4 Answer
      { range: `'${resolved.sheetName}'!AY${rowNum}`, values: [[params.q5Rating ?? ""]] },  // AY = Q5 Answer
      { range: `'${resolved.sheetName}'!BA${rowNum}`, values: [[params.q6Rating ?? ""]] },  // BA = Q6 Answer
      { range: `'${resolved.sheetName}'!BC${rowNum}`, values: [[params.q7Rating ?? ""]] },  // BC = Q7 Answer
      { range: `'${resolved.sheetName}'!BE${rowNum}`, values: [[params.q8Comment ?? ""]] }, // BE = Q8 Answer
      { range: `'${resolved.sheetName}'!BG${rowNum}`, values: [[params.q9Rating ?? ""]] },  // BG = Q9 Answer
      { range: `'${resolved.sheetName}'!BI${rowNum}`, values: [[params.q10Rating ?? ""]] }, // BI = Q10 Answer
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
  CHECK_IN:         COL_CHECK_IN,
  CHECK_OUT:        COL_CHECK_OUT,
  ROOMMATE_FIRST:   COL_ROOMMATE_FIRST,
  ROOMMATE_LAST:    COL_ROOMMATE_LAST,
  COORDINATOR:      COL_COORDINATOR,
  SANCTION_NUM:     COL_SANCTION_NUM,
  NUM_GAMES:        COL_NUM_GAMES,
  LEAGUE_MEMBER:    COL_LEAGUE_MEMBER,
  HOTEL_CONF:       COL_HOTEL_CONF,
  SQUAD_TIME_2:     COL_SQUAD_TIME_2,
  LANE_2:           COL_LANE_2,
  EXTRA_BANQUET_QR: COL_EXTRA_BANQUET_QR,
  BANQUET_QR:       COL_BANQUET_QR,
  POOL_QR:          COL_POOL_QR,
  GUEST_POOL_A:     COL_GUEST_POOL_A,
  GUEST_POOL_B:     COL_GUEST_POOL_B,
  GUEST_BANQUET_A:   COL_GUEST_BANQUET_A,
  GUEST_BANQUET_B:   COL_GUEST_BANQUET_B,
  POOL_USED:        COL_POOL_USED,
  EXTRA_BNQ_USED:   COL_EXTRA_BNQ_USED,
  BANQUET_USED:     COL_BANQUET_USED,
  GUEST_POOL_A_USED:     COL_GUEST_POOL_A_USED,
  GUEST_BANQUET_A_USED:  COL_GUEST_BANQUET_A_USED,
  GUEST_POOL_B_USED:     COL_GUEST_POOL_B_USED,
  GUEST_BANQUET_B_USED:  COL_GUEST_BANQUET_B_USED,
  EXTRA_POOL_QR:         COL_EXTRA_POOL_QR,
  EXTRA_POOL_USED:       COL_EXTRA_POOL_USED,
  Q1_QUESTION:      COL_Q1_QUESTION,
  Q2_QUESTION:      COL_Q2_QUESTION,
  Q3_QUESTION:      COL_Q3_QUESTION,
  Q4_QUESTION:      COL_Q4_QUESTION,
  Q5_QUESTION:      COL_Q5_QUESTION,
  Q6_QUESTION:      COL_Q6_QUESTION,
  Q7_QUESTION:      COL_Q7_QUESTION,
  Q8_QUESTION:      COL_Q8_QUESTION,
  Q9_QUESTION:      COL_Q9_QUESTION,
  Q10_QUESTION:     COL_Q10_QUESTION,
  Q1_ANSWER:        COL_Q1_ANSWER,
  Q2_ANSWER:        COL_Q2_ANSWER,
  Q3_ANSWER:        COL_Q3_ANSWER,
  Q4_ANSWER:        COL_Q4_ANSWER,
  Q5_ANSWER:        COL_Q5_ANSWER,
  Q6_ANSWER:        COL_Q6_ANSWER,
  Q7_ANSWER:        COL_Q7_ANSWER,
  Q8_ANSWER:        COL_Q8_ANSWER,
  Q9_ANSWER:        COL_Q9_ANSWER,
  Q10_ANSWER:       COL_Q10_ANSWER,
};
