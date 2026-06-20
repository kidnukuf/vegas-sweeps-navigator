/**
 * Google Sheets integration helper
 * Uses the gws CLI (Google Workspace CLI) which is pre-authenticated via the
 * Google Drive connector in Manus. No API keys or service account JSON needed.
 *
 * Sheet: TeamChallenge2026_Ledger_Final
 * Spreadsheet ID: 1Azwl5Lmj4BK69htTXB0PmWO8ww6jY_zz7OtmJjHSiFg
 *
 * Column layout (1-indexed):
 *   A=Phone, B=Email, C=Squad Time, D=Lane #, E=Center,
 *   F=Team #, G=Captain, H=First Name, I=Last Name, ...
 *   U=Guest Pool Party ($15 increments)
 *   W=Banquet QR URL, X=Pool Party QR URL
 *   Y=Guest pool qr code (suffix A)
 *   Z=Additional guest pool qr code (suffix B)
 *   AA=Guest banquet qr code
 *   AB=Additional guest banquet qr code
 *   AC=Guest reentry qr code
 */

import { execSync } from "child_process";

const SPREADSHEET_ID = "1Azwl5Lmj4BK69htTXB0PmWO8ww6jY_zz7OtmJjHSiFg";
const SHEET_NAME = "TeamChallenge2026_Ledger_Final";

// Column indices (0-based for array access)
const COL_FIRST_NAME = 7;  // H
const COL_LAST_NAME  = 8;  // I
const COL_LANE       = 3;  // D
const COL_BANQUET_QR = 22; // W
const COL_POOL_QR    = 23; // X
const COL_GUEST_POOL_A = 24; // Y — 1st extra guest pool QR (suffix A)
const COL_GUEST_POOL_B = 25; // Z — 2nd extra guest pool QR (suffix B)

// Sheet column letters for guest pool QR codes (up to 5 guests = A–E)
const GUEST_POOL_COLUMNS = ["Y", "Z", "AA", "AB", "AC"];

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
    const data = gws({ range: `${SHEET_NAME}!A1:AC` }) as { values?: string[][] };
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
 * Write the Banquet QR URL, Pool Party QR URL, and any guest pool QR URLs
 * into the bowler's row in the Google Sheet.
 *
 * Guest pool QR codes use the bowler's scantronId + suffix A, B, C, etc.
 * Each $15 in column U = one additional guest pool QR code.
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
      updateData.push({ range: `${SHEET_NAME}!W${rowNum}`, values: [[banquetQRUrl]] });
    }
    if (poolPartyQRUrl) {
      updateData.push({ range: `${SHEET_NAME}!X${rowNum}`, values: [[poolPartyQRUrl]] });
    }

    // Write guest pool QR URLs into Y, Z, AA, AB, AC (up to 5 guests)
    for (let i = 0; i < Math.min(guestPoolTokens.length, GUEST_POOL_COLUMNS.length); i++) {
      const col = GUEST_POOL_COLUMNS[i];
      const guestUrl = `${appOrigin}/scan/guest-pool/${guestPoolTokens[i].token}`;
      updateData.push({ range: `${SHEET_NAME}!${col}${rowNum}`, values: [[guestUrl]] });
    }

    if (updateData.length === 0) return;

    const body = {
      valueInputOption: "RAW",
      data: updateData,
    };

    gws({}, body);
    console.log(`[googleSheets] QR URLs written for ${firstName} ${lastName} (row ${rowNum}, ${guestPoolTokens.length} guest pool codes)`);
  } catch (err) {
    console.error("[googleSheets] writeQRCodesToSheet error (non-fatal):", err);
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
