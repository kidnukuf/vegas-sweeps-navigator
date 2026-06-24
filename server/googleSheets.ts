/**
 * Google Sheets integration helper
 * Uses the gws CLI (Google Workspace CLI) which is pre-authenticated via the
 * Google Drive connector in Manus. No API keys or service account JSON needed.
 *
 * Sheet: TeamChallenge2026_Ledger_Final
 * Spreadsheet ID: 1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM
 *
 * Column layout (A=col 0, 0-indexed):
 *   A=Bowler ID (write-back), B=Phone, C=Email, D=Squad Day & Time, E=Lane #,
 *   F=Center, G=Team #, H=Captain, I=First Name, J=Last Name,
 *   K=Under 21?, L=Sanction #, M=# Games, N=Best Avg, O=Team Name,
 *   P=League Member, Q=T-Shirt Size, R=Hotel Confirmation,
 *   S=Check In, T=Check Out, U=Roommate First Name, V=Roommate Last Name,
 *   W=Guest Pool Party, X=Extra Banquet,
 *   Y=Banquet QR URL, Z=Pool Party QR URL,
 *   AA=Guest pool qr code (suffix A), AB=Additional guest pool qr code (suffix B),
 *   AC=Guest banquet qr code, AD=Additional guest banquet qr code,
 *   AE=Guest reentry qr code
 */

import { execSync } from "child_process";

const SPREADSHEET_ID = "1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM";
const SHEET_NAME = "TeamChallenge2026_Ledger_Final";

// Column indices (0-based for array access after the new Bowler ID column A)
const COL_BOWLER_ID   = 0;  // A — write-back: scantron ID
const COL_PHONE       = 1;  // B
const COL_EMAIL       = 2;  // C
const COL_LANE        = 4;  // E
const COL_FIRST_NAME  = 8;  // I
const COL_LAST_NAME   = 9;  // J
const COL_BANQUET_QR  = 24; // Y
const COL_POOL_QR     = 25; // Z
const COL_GUEST_POOL_A = 26; // AA — 1st extra guest pool QR (suffix A)
const COL_GUEST_POOL_B = 27; // AB — 2nd extra guest pool QR (suffix B)

// Sheet column letters for guest pool QR codes (up to 5 guests = AA–AE)
const GUEST_POOL_COLUMNS = ["AA", "AB", "AC", "AD", "AE"];

// Suppress unused-variable warnings for constants only used in comments/docs
void COL_PHONE; void COL_EMAIL; void COL_GUEST_POOL_A; void COL_GUEST_POOL_B;

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
 * Find the row number (1-indexed) for a bowler by first name, last name, and lane number.
 * Returns null if not found.
 */
async function findBowlerRow(
  firstName: string,
  lastName: string,
  laneNumber: number | null
): Promise<number | null> {
  try {
    const data = gws({ range: `${SHEET_NAME}!A1:AE` }) as { values?: string[][] };
    const rows = data.values ?? [];

    for (let i = 1; i < rows.length; i++) { // skip header row
      const row = rows[i];
      const rowFirst = (row[COL_FIRST_NAME] ?? "").trim().toLowerCase();
      const rowLast  = (row[COL_LAST_NAME]  ?? "").trim().toLowerCase();
      const rowLane  = parseInt(row[COL_LANE] ?? "0", 10);

      const nameMatch = rowFirst === firstName.trim().toLowerCase()
                     && rowLast  === lastName.trim().toLowerCase();
      const laneMatch = laneNumber == null || rowLane === laneNumber;

      if (nameMatch && laneMatch) {
        return i + 1; // 1-indexed sheet row
      }
    }
    return null;
  } catch (err) {
    console.error("[googleSheets] findBowlerRow error:", err);
    return null;
  }
}

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
      console.warn(`[googleSheets] writeBowlerIdToSheet: Bowler not found: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }
    gws({}, {
      valueInputOption: "RAW",
      data: [{ range: `${SHEET_NAME}!A${rowNum}`, values: [[scantronId]] }],
    });
    console.log(`[googleSheets] Bowler ID ${scantronId} written for ${firstName} ${lastName} (row ${rowNum})`);
  } catch (err) {
    console.error("[googleSheets] writeBowlerIdToSheet error (non-fatal):", err);
  }
}

/**
 * Write the Banquet QR URL, Pool Party QR URL, and any guest pool QR URLs
 * into the bowler's row in the Google Sheet.
 *
 * New column positions (post Bowler ID insert):
 *   Y=Banquet QR URL, Z=Pool Party QR URL, AA–AE=Guest pool QR codes
 *
 * @param firstName         Bowler's legal first name
 * @param lastName          Bowler's legal last name
 * @param laneNumber        Bowler's lane number (used to disambiguate same-name bowlers)
 * @param banquetToken      UUID token for banquet QR
 * @param poolPartyToken    UUID token for pool party QR
 * @param guestPoolTokens   Array of {suffix, token} for extra guest pool QR codes
 * @param appOrigin         Base URL for QR scan links
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
      console.warn(`[googleSheets] Bowler not found in sheet: ${firstName} ${lastName} lane ${laneNumber}`);
      return;
    }

    const updateData: { range: string; values: string[][] }[] = [];

    if (banquetQRUrl) {
      // Column Y (index 24) = Banquet QR URL
      updateData.push({ range: `${SHEET_NAME}!Y${rowNum}`, values: [[banquetQRUrl]] });
    }
    if (poolPartyQRUrl) {
      // Column Z (index 25) = Pool Party QR URL
      updateData.push({ range: `${SHEET_NAME}!Z${rowNum}`, values: [[poolPartyQRUrl]] });
    }

    // Write guest pool QR URLs into AA, AB, AC, AD, AE (up to 5 guests)
    for (let i = 0; i < Math.min(guestPoolTokens.length, GUEST_POOL_COLUMNS.length); i++) {
      const col = GUEST_POOL_COLUMNS[i];
      const guestUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[i].token}`;
      updateData.push({ range: `${SHEET_NAME}!${col}${rowNum}`, values: [[guestUrl]] });
    }

    if (updateData.length === 0) return;

    gws({}, { valueInputOption: "RAW", data: updateData });
    console.log(`[googleSheets] QR URLs written for ${firstName} ${lastName} (row ${rowNum}, ${guestPoolTokens.length} guest pool codes)`);
  } catch (err) {
    console.error("[googleSheets] writeQRCodesToSheet error (non-fatal):", err);
  }
}

/**
 * Write phone and email into columns B and C of the bowler's row in the Google Sheet.
 * Called when the Event Director confirms a contact info request.
 * (Column A is now Bowler ID, so phone=B and email=C)
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
      console.warn(`[googleSheets] writeContactInfo: Bowler not found: ${firstName} ${lastName}`);
      return { rowNum: null };
    }
    const updateData = [
      { range: `${SHEET_NAME}!B${rowNum}`, values: [[phone]] },   // B = Phone
      { range: `${SHEET_NAME}!C${rowNum}`, values: [[email]] },   // C = Email
    ];
    gws({}, { valueInputOption: "RAW", data: updateData });
    console.log(`[googleSheets] Contact info written for ${firstName} ${lastName} (row ${rowNum})`);
    return { rowNum };
  } catch (err) {
    console.error("[googleSheets] writeContactInfoToSheet error:", err);
    return { rowNum: null };
  }
}

/**
 * Normalize squad time codes to human-readable labels.
 * Used for display in the app UI.
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
