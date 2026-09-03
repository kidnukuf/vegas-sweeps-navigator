import { router, publicProcedure } from "../_core/trpc";
import { requireEdSession } from "../_core/edAuth";
import { z } from "zod";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { rawQuery, rawExec, getEventSheetTarget, recordSheetSync } from "../db";
import { getSheetsClient, writeQRCodesToSheet, writeBowlerIdToSheet, clearQRUsedColumns, sortSheetRows } from "../googleSheets";
import { assertEventAccess } from "../_core/edAuth";
import { buildHotelRoomPlan, normalizedName, type HotelRoomRosterRow } from "../../shared/hotelRoomPlanner";
import { createHash } from "node:crypto";

const APP_ORIGIN = process.env.APP_ORIGIN ?? "https://vegasweeps-y8eywesk.manus.space";

// Column indices for Master Sheet (0-indexed)
// Exact layout from permanent sheet: 1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM
const COLS = {
  BOWLER_ID: 0,            // A  — Bowler ID
  PHONE: 1,                // B  — Phone
  EMAIL: 2,                // C  — Email
  SQUAD_TIME: 3,           // D  — Squad Day & Time
  LANE: 4,                 // E  — Lane #
  CENTER: 5,               // F  — Center
  COORDINATOR: 6,          // G  — Coordinator
  TEAM_CODE: 7,            // H  — Team #
  CAPTAIN: 8,              // I  — Captain
  FIRST_NAME: 9,           // J  — First Name
  LAST_NAME: 10,           // K  — Last Name
  UNDER_21: 11,            // L  — Under 21?
  SANCTION: 12,            // M  — Sanction #
  GAMES: 13,               // N  — # Games
  BEST_AVG: 14,            // O  — Best Avg
  TEAM_NAME: 15,           // P  — Team Name
  LEAGUE_MEMBER: 16,       // Q  — League Member
  TSHIRT_SIZE: 17,         // R  — T-Shirt Size
  HOTEL_CONFIRMATION: 18,  // S  — Hotel Confirmation
  CHECK_IN: 19,            // T  — Check In
  CHECK_OUT: 20,           // U  — Check Out
  ROOMMATE_FIRST: 21,      // V  — Roommate First Name
  ROOMMATE_LAST: 22,       // W  — Roommate Last Name
  SQUAD_TIME_2: 23,        // X  — 2nd Squad Time
  LANE_2: 24,              // Y  — Lane # (2nd)
  POOL_QR: 25,             // Z  — Pool QR
  POOL_USED: 26,           // AA — Pool Used
  BANQUET_QR: 27,          // AB — Banquet QR
  BANQUET_USED: 28,        // AC — Banquet Used
  GUEST_POOL_A: 29,        // AD — #A Pool QR
  GUEST_POOL_A_USED: 30,   // AE — #A Pool Used
  GUEST_BANQUET_A: 31,     // AF — #A Banquet QR
  GUEST_BANQUET_A_USED: 32,// AG — #A Banquet Used
  GUEST_POOL_B: 33,        // AH — #B Pool QR
  GUEST_POOL_B_USED: 34,   // AI — #B Pool Used
  GUEST_BANQUET_B: 35,     // AJ — #B Banquet QR
  GUEST_BANQUET_B_USED: 36,// AK — #B Banquet Used
  EXTRA_BANQUET_QR: 37,    // AL — 2nd Banquet QR
  EXTRA_BNQ_USED: 38,      // AM — 2nd Banquet Used
  EXTRA_POOL_QR: 39,       // AN — 2nd Pool QR
  EXTRA_POOL_USED: 40,     // AO — 2nd Pool Used
  // Aliases for backwards compatibility with existing code
  HOTEL_REG: 22,           // W  — (no separate hotel reg col; maps to Roommate Last Name col)
  POOL_CONFIRMED: 30,      // AE — #A Pool Used (alias)
  GUEST_BANQUET_QR: 31,    // AF — #A Banquet QR (alias)
  POOL_USED_2: 40,         // AO — 2nd Pool Used (alias)
  BANQUET_USED_2: 38,      // AM — 2nd Banquet Used (alias)
  BANQUET_QR_A: 31,        // AF — #A Banquet QR (alias)
  BANQUET_QR_B: 35,        // AJ — #B Banquet QR (alias)
  GUEST_POOL_USED: 30,     // AE — #A Pool Used (alias)
  GUEST_POOL_QR: 29,       // AD — #A Pool QR (alias)
  POOL_ENTRY_A_USED: 30,   // AE — #A Pool Used (alias)
  POOL_QR_A: 29,           // AD — #A Pool QR (alias)
  POOL_ENTRY_B_USED: 34,   // AI — #B Pool Used (alias)
  POOL_QR_B: 33,           // AH — #B Pool QR (alias)
  LEAGUE: 16,              // Q  — League Member (alias)
  BANQUET_TABLE: 27,       // AB — Banquet QR (placeholder)
  EXTRA_BANQUET: 37,       // AL — 2nd Banquet QR (alias)
  BANQUET_QR_USED: 28,     // AC — Banquet Used (alias)
  CODE: 0,                 // A  — Bowler ID (placeholder)
  DATE_1: 0,               // A  — placeholder
  DATE_2: 0,               // A  — placeholder
  SECOND_CENTER: 5,        // F  — Center (placeholder)
  SECOND_TEAM: 7,          // H  — Team # (placeholder)
  SECOND_SQUAD: 23,        // X  — 2nd Squad Time (placeholder)
  // Survey columns
  Q1_QUESTION: 41,         // AP — Q1 Overall Experience?
  Q1_ANSWER: 42,           // AQ — Q1 answer
  Q2_QUESTION: 43,         // AR — Q2 Bowling Venue?
  Q2_ANSWER: 44,           // AS — Q2 Answer
  Q3_QUESTION: 45,         // AT — Q3 Event Organization?
  Q3_ANSWER: 46,           // AU — Q3 Answer
  Q4_QUESTION: 47,         // AV — Q4 Pool Party?
  Q4_ANSWER: 48,           // AW — Q4 Answer
  Q5_QUESTION: 49,         // AX — Q5 Banquet Experience?
  Q5_ANSWER: 50,           // AY — Q5 Answer
  Q6_QUESTION: 51,         // AZ — Q6 This App?
  Q6_ANSWER: 52,           // BA — Q6 Answer
  Q7_QUESTION: 53,         // BB — Q7 League App Interest?
  Q7_ANSWER: 54,           // BC — Q7 Answer
  Q8_QUESTION: 55,         // BD — Q8 Additional Comments
  Q8_ANSWER: 56,           // BE — Q8 Answer
  Q9_QUESTION: 57,         // BF — Q9 Testimonial Permission?
  Q9_ANSWER: 58,           // BG — Q9 Answer
  Q10_QUESTION: 59,        // BH — Q10 Attend Next Year?
  Q10_ANSWER: 60,          // BI — Q10 Answer
};

interface SheetRow {
  bowlerId: string;
  teamName: string;
  tshirtSize: string;
  code: string;
  date1: string;
  date2: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  league: string;
  teamCode: string;
  centerName: string;
  squadTime: string;
  laneNumber: number | null;
  under21: boolean;
  sanction: string;
  games: number | null;
  bestAvg: number | null;
  leagueMember: string;
  hotelConfirmation: string;
  hotelCheckin: string;
  hotelCheckout: string;
  roommateFirst: string;
  roommateLast: string;
  banquetTable: string;
  extraBanquet: string;
  banquetQrUsed: string;
  banquetQr: string;
  poolEntryAUsed: string;
  poolQrA: string;
  poolEntryBUsed: string;
  poolQrB: string;
  banquetQrA: string;
  banquetQrB: string;
  secondCenter: string;
  secondTeam: string;
  secondSquad: string;
  poolQr: string;
  guestPoolUsed: string;
  guestPoolQr: string;
}

function parseSheetRow(row: string[]): SheetRow {
  return {
    bowlerId: row[COLS.BOWLER_ID]?.trim() || "",
    teamName: row[COLS.TEAM_NAME]?.trim() || "",
    tshirtSize: row[COLS.TSHIRT_SIZE]?.trim() || "",
    code: row[COLS.CODE]?.trim() || "",
    date1: row[COLS.DATE_1]?.trim() || "",
    date2: row[COLS.DATE_2]?.trim() || "",
    firstName: row[COLS.FIRST_NAME]?.trim() || "",
    lastName: row[COLS.LAST_NAME]?.trim() || "",
    phone: row[COLS.PHONE]?.trim() || "",
    email: row[COLS.EMAIL]?.trim() || "",
    league: row[COLS.LEAGUE]?.trim() || "",
    teamCode: row[COLS.TEAM_CODE]?.trim() || "",
    centerName: row[COLS.CENTER]?.trim() || "",
    squadTime: row[COLS.SQUAD_TIME]?.trim() || "",
    laneNumber: parseInt(row[COLS.LANE]?.trim() || "0") || null,
    under21: row[COLS.UNDER_21]?.trim().toLowerCase() === "y",
    sanction: row[COLS.SANCTION]?.trim() || "",
    games: parseInt(row[COLS.GAMES]?.trim() || "0") || null,
    bestAvg: parseInt(row[COLS.BEST_AVG]?.trim() || "0") || null,
    leagueMember: row[COLS.LEAGUE_MEMBER]?.trim() || "",
    hotelConfirmation: row[COLS.HOTEL_CONFIRMATION]?.trim() || "",
    hotelCheckin: row[COLS.CHECK_IN]?.trim() || "",
    hotelCheckout: row[COLS.CHECK_OUT]?.trim() || "",
    roommateFirst: row[COLS.ROOMMATE_FIRST]?.trim() || "",
    roommateLast: row[COLS.ROOMMATE_LAST]?.trim() || "",
    banquetTable: row[COLS.BANQUET_TABLE]?.trim() || "",
    extraBanquet: row[COLS.EXTRA_BANQUET]?.trim() || "",
    banquetQrUsed: row[COLS.BANQUET_QR_USED]?.trim() || "",
    banquetQr: row[COLS.BANQUET_QR]?.trim() || "",
    poolEntryAUsed: row[COLS.POOL_ENTRY_A_USED]?.trim() || "",
    poolQrA: row[COLS.POOL_QR_A]?.trim() || "",
    poolEntryBUsed: row[COLS.POOL_ENTRY_B_USED]?.trim() || "",
    poolQrB: row[COLS.POOL_QR_B]?.trim() || "",
    banquetQrA: row[COLS.BANQUET_QR_A]?.trim() || "",
    banquetQrB: row[COLS.BANQUET_QR_B]?.trim() || "",
    secondCenter: row[COLS.SECOND_CENTER]?.trim() || "",
    secondTeam: row[COLS.SECOND_TEAM]?.trim() || "",
    secondSquad: row[COLS.SECOND_SQUAD]?.trim() || "",
    poolQr: row[COLS.POOL_QR]?.trim() || "",
    guestPoolUsed: row[COLS.GUEST_POOL_USED]?.trim() || "",
    guestPoolQr: row[COLS.GUEST_POOL_QR]?.trim() || "",
  };
}

const ROOM_ID_HEADER = "Hotel Room ID";

type RoomPlanSheetData = {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
  plan: ReturnType<typeof buildHotelRoomPlan>;
  sourceHash: string;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function columnLetter(index: number): string {
  let remaining = index + 1;
  let label = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

async function loadRoomPlanSheetData(eventId: number, sheetTabOverride?: string): Promise<RoomPlanSheetData> {
  const target = await getEventSheetTarget(eventId);
  if (sheetTabOverride) target.sheetName = sheetTabOverride;
  if (!target.spreadsheetId || !target.sheetName) {
    throw new Error("No Google Sheet tab is configured for this event. Select the event tab in Event Settings first.");
  }

  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Google Sheets connection is unavailable.");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: target.spreadsheetId,
    range: `'${target.sheetName}'!A:ZZ`,
  });
  const sheetRows = (response.data.values ?? []) as string[][];
  const headers = (sheetRows[0] ?? []).map((value) => String(value ?? ""));
  const firstNameColumn = headers.findIndex((header) => normalizeHeader(header) === "first name");
  const lastNameColumn = headers.findIndex((header) => normalizeHeader(header) === "last name");
  const roommateFirstColumn = headers.findIndex((header) => normalizeHeader(header) === "roommate first name");
  const roommateLastColumn = headers.findIndex((header) => normalizeHeader(header) === "roommate last name");
  if (firstNameColumn < 0 || lastNameColumn < 0 || roommateFirstColumn < 0 || roommateLastColumn < 0) {
    throw new Error("The selected tab must contain First Name, Last Name, Roommate First Name, and Roommate Last Name columns.");
  }

  const rosterRows: HotelRoomRosterRow[] = sheetRows.slice(1).map((row, rowIndex) => ({
    rowNumber: rowIndex + 2,
    firstName: String(row[firstNameColumn] ?? ""),
    lastName: String(row[lastNameColumn] ?? ""),
    roommateFirstName: String(row[roommateFirstColumn] ?? ""),
    roommateLastName: String(row[roommateLastColumn] ?? ""),
  })).filter((row) => normalizedName(row.firstName, row.lastName).length > 0);

  const plan = buildHotelRoomPlan(rosterRows);
  const sourceHash = createHash("sha256").update(JSON.stringify({
    sheetName: target.sheetName,
    headers,
    rows: rosterRows,
  })).digest("hex");
  return { spreadsheetId: target.spreadsheetId, sheetName: target.sheetName, headers, plan, sourceHash };
}

export const masterSheetRouter = router({
  importMasterSheet: publicProcedure
    .input(z.object({ eventId: z.number(), rows: z.array(z.record(z.string(), z.unknown())) }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const { eventId, rows } = input;
      let imported = 0;
      let errors = 0;
      const errorDetails: { row: number; error: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          const sheetRow = parseSheetRow(Object.values(row).map((v) => String(v || "")));

          if (!sheetRow.firstName || !sheetRow.lastName) continue;

          // Look up centerId from centerName
          let centerId: number | null = null;
          if (sheetRow.centerName) {
            console.log("[DEBUG] Center name from sheet (raw):", JSON.stringify(sheetRow.centerName));
            console.log("[DEBUG] Center name trimmed:", JSON.stringify(sheetRow.centerName?.trim()));
            
            // Try case-insensitive lookup with trimming
            const centerResult = await rawQuery(
              `SELECT id, centerName FROM bowling_centers WHERE LOWER(TRIM(centerName)) = LOWER(TRIM(?))`,
              [sheetRow.centerName]
            );
            console.log("[DEBUG] Lookup result:", centerResult);
            
            if (centerResult.length > 0) {
              centerId = (centerResult[0] as any).id as number | null;
              console.log("[DEBUG] Match found! centerId:", centerId);
            } else {
              // Log all available centers for comparison
              const allCenters = await rawQuery(`SELECT id, centerName FROM bowling_centers`);
              console.log("[DEBUG] No match found. Available centers:", allCenters);
            }
          }

          await rawQuery(
            `INSERT INTO bowlers (eventId, firstName, lastName, phone, email, squadTime, laneNumber, centerId, league, teamCode, teamName, under21, sanction, games, bestAvg, leagueMember, tshirtSize, hotelConfirmation, hotelCheckin, hotelCheckout, roommateFirst, roommateLast, banquetTable, extraBanquet, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE phone = VALUES(phone), email = VALUES(email), squadTime = VALUES(squadTime), laneNumber = VALUES(laneNumber), centerId = VALUES(centerId), league = VALUES(league), teamCode = VALUES(teamCode), teamName = VALUES(teamName), under21 = VALUES(under21), sanction = VALUES(sanction), games = VALUES(games), bestAvg = VALUES(bestAvg), leagueMember = VALUES(leagueMember), tshirtSize = VALUES(tshirtSize), hotelConfirmation = VALUES(hotelConfirmation), hotelCheckin = VALUES(hotelCheckin), hotelCheckout = VALUES(hotelCheckout), roommateFirst = VALUES(roommateFirst), roommateLast = VALUES(roommateLast), banquetTable = VALUES(banquetTable), extraBanquet = VALUES(extraBanquet), updatedAt = NOW()`,
            [eventId, sheetRow.firstName, sheetRow.lastName, sheetRow.phone, sheetRow.email, sheetRow.squadTime, sheetRow.laneNumber, centerId, sheetRow.league, sheetRow.teamCode, sheetRow.teamName, sheetRow.under21 ? 1 : 0, sheetRow.sanction, sheetRow.games, sheetRow.bestAvg, sheetRow.leagueMember, sheetRow.tshirtSize, sheetRow.hotelConfirmation, sheetRow.hotelCheckin, sheetRow.hotelCheckout, sheetRow.roommateFirst, sheetRow.roommateLast, sheetRow.banquetTable, sheetRow.extraBanquet]
          );

          imported++;
        } catch (err) {
          errors++;
          errorDetails.push({ row: i + 1, error: String(err) });
        }
      }

      return { imported, errors, errorDetails };
    }),

  detectChanges: publicProcedure
    .input(z.object({ eventId: z.number(), rows: z.array(z.record(z.string(), z.unknown())) }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const { eventId, rows } = input;
      let newBowlers = 0;
      let updatedBowlers = 0;
      const changes: { firstName: string; lastName: string; type: "new" | "updated"; changes?: Record<string, { old: string; new: string }> }[] = [];

      for (const row of rows) {
        const sheetRow = parseSheetRow(Object.values(row).map((v) => String(v || "")));

        if (!sheetRow.firstName || !sheetRow.lastName) continue;

        const existing = await rawQuery(`SELECT * FROM bowlers WHERE eventId = ? AND firstName = ? AND lastName = ?`, [eventId, sheetRow.firstName, sheetRow.lastName]);

        if (existing.length === 0) {
          newBowlers++;
          changes.push({ firstName: sheetRow.firstName, lastName: sheetRow.lastName, type: "new" });
        } else {
          const bowler = existing[0];
          const changedFields: Record<string, { old: string; new: string }> = {};

          if (bowler.phone !== sheetRow.phone) changedFields.phone = { old: String(bowler.phone || ""), new: sheetRow.phone };
          if (bowler.email !== sheetRow.email) changedFields.email = { old: String(bowler.email || ""), new: sheetRow.email };
          if (bowler.laneNumber !== sheetRow.laneNumber) changedFields.lane = { old: String(bowler.laneNumber), new: String(sheetRow.laneNumber) };
          if (bowler.teamName !== sheetRow.teamName) changedFields.teamName = { old: String(bowler.teamName || ""), new: sheetRow.teamName };
          if (bowler.tshirtSize !== sheetRow.tshirtSize) changedFields.tshirtSize = { old: String(bowler.tshirtSize || ""), new: sheetRow.tshirtSize };

          if (Object.keys(changedFields).length > 0) {
            updatedBowlers++;
            changes.push({ firstName: sheetRow.firstName, lastName: sheetRow.lastName, type: "updated", changes: changedFields });
          }
        }
      }

      return { newBowlers, updatedBowlers, changes };
    }),

  exportToGoogleSheetFormat: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const { eventId } = input;

      // Get event to find Google Sheet
      const event = await rawQuery(`SELECT sheetSpreadsheetId, sheetTabName FROM events WHERE id = ?`, [eventId]);
      if (!event || !event[0]?.sheetSpreadsheetId) {
        throw new Error("Event not configured with Google Sheet");
      }

      const { sheetSpreadsheetId, sheetTabName } = event[0];

      // Fetch all data from Google Sheet, including guest names, claim codes,
      // and payout fields that now extend through BP.
      const sheetsClient = await getSheetsClient();
      if (!sheetsClient) {
        throw new Error("Google Sheets client not available");
      }

      const resp = await (sheetsClient.spreadsheets.values.get as any)({
        spreadsheetId: sheetSpreadsheetId,
        range: `'${sheetTabName}'!A:BP`,
      });

      const allRows = ((resp as any).data?.values as string[][]) || [];
      if (allRows.length === 0) {
        throw new Error("No data found in Google Sheet");
      }

      // First row is headers, return everything as-is
      const headers = allRows[0];
      const dataRows = allRows.slice(1);

      // Ensure each row has all columns (pad with empty strings)
      const normalizedRows = dataRows.map((row: string[]) => {
        const normalized = [...row];
        while (normalized.length < headers.length) {
          normalized.push("");
        }
        return normalized.slice(0, headers.length);
      });

      const csvContent = [headers.join("\t"), ...normalizedRows.map((row: string[]) => row.join("\t"))].join("\n");

      return { csv: csvContent, rowCount: normalizedRows.length };
    }),

  exportForRaspberryPi: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const { eventId } = input;

      const bowlers = await rawQuery(`SELECT b.id, b.scantronId, b.firstName, b.lastName, b.laneNumber, b.centerName, b.teamName, b.squadTime FROM bowlers b WHERE b.eventId = ? ORDER BY b.squadTime, b.laneNumber`, [eventId]);

      const headers = ["Bowler ID", "First Name", "Last Name", "Lane", "Center", "Team", "Squad Time"];
      const rows = bowlers.map((b: any) => [String(b.scantronId || ""), String(b.firstName || ""), String(b.lastName || ""), String(b.laneNumber || ""), String(b.centerName || ""), String(b.teamName || ""), String(b.squadTime || "")]);

      const csvContent = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");

      return { csv: csvContent, rowCount: rows.length };
    }),

  exportFinalResults: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const { eventId } = input;

      const bowlers = await rawQuery(`SELECT * FROM bowlers WHERE eventId = ? ORDER BY squadTime, laneNumber`, [eventId]);

      const headers = ["Bowler ID", "First Name", "Last Name", "Phone", "Email", "Lane", "Center", "Team", "Squad Time", "T-Shirt Size", "Banquet Table", "Check In", "Check Out", "Event Completed"];

      const rows = bowlers.map((b: any) => [
        String(b.scantronId || ""),
        String(b.firstName || ""),
        String(b.lastName || ""),
        String(b.phone || ""),
        String(b.email || ""),
        String(b.laneNumber || ""),
        String(b.centerName || ""),
        String(b.teamName || ""),
        String(b.squadTime || ""),
        String(b.tshirtSize || ""),
        String(b.banquetTable || ""),
        String(b.hotelCheckin || ""),
        String(b.hotelCheckout || ""),
        "✓",
      ]);

      const csvContent = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");

      return { csv: csvContent, rowCount: rows.length };
    }),

  getAllBowlersWithQRCodes: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const bowlers = await rawQuery(
        `SELECT 
          b.id, b.scantronId, b.firstName, b.lastName, b.centerName, b.teamCode,
          b.poolPartyToken, b.banquetToken, b.poolPartyUsed, b.banquetUsed
        FROM bowlers b
        WHERE b.eventId = ?
        ORDER BY b.lastName, b.firstName`,
        [input.eventId]
      ) as Array<{
        id: number;
        scantronId: string | null;
        firstName: string;
        lastName: string;
        centerName: string | null;
        teamCode: string | null;
        poolPartyToken: string | null;
        banquetToken: string | null;
        poolPartyUsed: boolean;
        banquetUsed: boolean;
      }>;

      return bowlers;
    }),

  /**
   * Bulk-sync all QR codes for an event to the Google Sheet.
   * Iterates every bowler that has at least one token (pool, banquet, or guest)
   * and writes all QR URLs in a single fire-and-forget batch per bowler.
   * Returns counts of bowlers synced, skipped (no tokens), and failed.
   */
  bulkSyncQRCodes: publicProcedure
    .input(z.object({ eventId: z.number(), sheetTabOverride: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const sheetTarget = await getEventSheetTarget(input.eventId);
      if (!sheetTarget.spreadsheetId || (!sheetTarget.sheetName && !input.sheetTabOverride)) {
        throw new Error("No Google Sheet configured for this event. Set the Sheet ID and Tab Name in Event Settings first.");
      }
      // Allow the ED to override the tab name for this operation
      if (input.sheetTabOverride) sheetTarget.sheetName = input.sheetTabOverride;

      // Fetch all bowlers with any token
      const bowlers = await rawQuery<{
        id: number;
        legalFirstName: string;
        legalLastName: string;
        laneNumber: number | null;
        scantronId: string | null;
        poolPartyToken: string | null;
        banquetToken: string | null;
      }>(
        `SELECT id, legalFirstName, legalLastName, laneNumber, scantronId, poolPartyToken, banquetToken
         FROM bowlers
         WHERE eventId = ?
         ORDER BY legalLastName, legalFirstName`,
        [input.eventId]
      );

      // Fetch all guest tokens for this event grouped by bowlerId
      const guestRows = await rawQuery<{
        bowlerId: number;
        suffix: string;
        token: string;
        banquetToken: string | null;
        disabled: number;
      }>(
        `SELECT bowlerId, suffix, token, banquetToken, disabled
         FROM guest_pool_party_tokens
         WHERE eventId = ?
         ORDER BY bowlerId, suffix`,
        [input.eventId]
      );

      // Group guest tokens by bowlerId
      const guestsByBowler = new Map<number, typeof guestRows>();
      for (const g of guestRows) {
        if (!guestsByBowler.has(g.bowlerId)) guestsByBowler.set(g.bowlerId, []);
        guestsByBowler.get(g.bowlerId)!.push(g);
      }

      let synced = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const bowler of bowlers) {
        const guests = (guestsByBowler.get(bowler.id) ?? []).filter(g => !g.disabled);
        const hasAnyToken =
          bowler.poolPartyToken ||
          bowler.banquetToken ||
          guests.some(g => g.token || g.banquetToken);

        if (!hasAnyToken) { skipped++; continue; }

        try {
          // Also write Bowler ID if we have a scantronId
          if (bowler.scantronId) {
            await writeBowlerIdToSheet({
              firstName: bowler.legalFirstName,
              lastName: bowler.legalLastName,
              laneNumber: bowler.laneNumber,
              scantronId: bowler.scantronId,
              target: sheetTarget,
            });
          }
          await writeQRCodesToSheet({
            firstName: bowler.legalFirstName,
            lastName: bowler.legalLastName,
            laneNumber: bowler.laneNumber,
            poolPartyToken: bowler.poolPartyToken ?? null,
            banquetToken: bowler.banquetToken ?? null,
            guestPoolTokens: guests
              .filter(g => g.token && !g.token.endsWith("-BQ"))
              .map(g => ({ suffix: g.suffix, token: g.token })),
            guestBanquetTokens: guests
              .filter(g => g.banquetToken)
              .map(g => ({ suffix: g.suffix, banquetToken: g.banquetToken! })),
            appOrigin: APP_ORIGIN,
            target: sheetTarget,
          });
          synced++;
        } catch (err) {
          failed++;
          errors.push(`${bowler.legalFirstName} ${bowler.legalLastName}: ${String(err)}`);
        }
      }

      if (synced > 0) await recordSheetSync(input.eventId);

      return { synced, skipped, failed, errors };
    }),

  /**
   * Regenerate missing poolPartyToken / banquetToken for bowlers that were
   * imported before token generation was wired up (token columns are null).
   * Generates fresh UUIDs, persists them, then writes all QR URLs to the sheet.
   * Returns counts of bowlers updated, already-had-tokens (skipped), and failed.
   */
  regenerateMissingTokens: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const sheetTarget = await getEventSheetTarget(input.eventId);
      // Sheet target is optional — we still generate tokens even if no sheet is configured,
      // but we only attempt the write-back when a target exists.
      const hasSheet = !!(sheetTarget.spreadsheetId && sheetTarget.sheetName);

      // Find bowlers missing either token
      const bowlers = await rawQuery<{
        id: number;
        legalFirstName: string;
        legalLastName: string;
        laneNumber: number | null;
        scantronId: string | null;
        poolPartyToken: string | null;
        banquetToken: string | null;
      }>(
        `SELECT id, legalFirstName, legalLastName, laneNumber, scantronId, poolPartyToken, banquetToken
         FROM bowlers
         WHERE eventId = ? AND (poolPartyToken IS NULL OR banquetToken IS NULL)
         ORDER BY legalLastName, legalFirstName`,
        [input.eventId]
      );

      // Also count how many already have both tokens (for the summary)
      const totalRows = await rawQuery<{ total: number }>(
        `SELECT COUNT(*) as total FROM bowlers WHERE eventId = ?`,
        [input.eventId]
      );
      const totalBowlers = totalRows[0]?.total ?? 0;
      const alreadyComplete = totalBowlers - bowlers.length;

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const bowler of bowlers) {
        try {
          const newPoolToken  = bowler.poolPartyToken  ?? (uuidv4().replace(/-/g, ""));
          const newBanquetToken = bowler.banquetToken ?? (uuidv4().replace(/-/g, ""));

          // Only update the columns that are actually null
          if (!bowler.poolPartyToken && !bowler.banquetToken) {
            await rawQuery(
              `UPDATE bowlers SET poolPartyToken = ?, banquetToken = ? WHERE id = ?`,
              [newPoolToken, newBanquetToken, bowler.id]
            );
          } else if (!bowler.poolPartyToken) {
            await rawQuery(
              `UPDATE bowlers SET poolPartyToken = ? WHERE id = ?`,
              [newPoolToken, bowler.id]
            );
          } else {
            await rawQuery(
              `UPDATE bowlers SET banquetToken = ? WHERE id = ?`,
              [newBanquetToken, bowler.id]
            );
          }

          // Fetch guest tokens for this bowler
          const guestRows = await rawQuery<{
            suffix: string; token: string; banquetToken: string | null; disabled: number;
          }>(
            `SELECT suffix, token, banquetToken, disabled FROM guest_pool_party_tokens WHERE bowlerId = ? ORDER BY suffix`,
            [bowler.id]
          );
          const activeGuests = guestRows.filter(g => !g.disabled);

          if (hasSheet) {
            if (bowler.scantronId) {
              await writeBowlerIdToSheet({
                firstName: bowler.legalFirstName,
                lastName: bowler.legalLastName,
                laneNumber: bowler.laneNumber,
                scantronId: bowler.scantronId,
                target: sheetTarget,
              });
            }
            await writeQRCodesToSheet({
              firstName: bowler.legalFirstName,
              lastName: bowler.legalLastName,
              laneNumber: bowler.laneNumber,
              poolPartyToken: newPoolToken,
              banquetToken: newBanquetToken,
              guestPoolTokens: activeGuests
                .filter(g => g.token && !g.token.endsWith("-BQ"))
                .map(g => ({ suffix: g.suffix, token: g.token })),
              guestBanquetTokens: activeGuests
                .filter(g => g.banquetToken)
                .map(g => ({ suffix: g.suffix, banquetToken: g.banquetToken! })),
              appOrigin: APP_ORIGIN,
              target: sheetTarget,
            });
          }

          updated++;
        } catch (err) {
          failed++;
          errors.push(`${bowler.legalFirstName} ${bowler.legalLastName}: ${String(err)}`);
        }
      }

      if (updated > 0 && hasSheet) await recordSheetSync(input.eventId);

      return { updated, alreadyComplete, failed, errors, hasSheet };
    }),

  // ─── Clear all QR "used" columns in the Google Sheet ──────────────────────
  clearQRUsedColumns: publicProcedure
    .input(z.object({ eventId: z.number().int().positive(), sheetTabOverride: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const sheetTarget = await getEventSheetTarget(input.eventId);
      if (!sheetTarget.spreadsheetId) {
        return { cleared: 0, error: "No Google Sheet linked to this event. Import from a sheet URL first." };
      }
      if (input.sheetTabOverride) sheetTarget.sheetName = input.sheetTabOverride;
      const result = await clearQRUsedColumns({
        target: { spreadsheetId: sheetTarget.spreadsheetId, sheetName: sheetTarget.sheetName },
      });
      return result;
    }),

  // ─── Sort sheet rows by center → team # → last name → first name ────────────
  sortSheetRows: publicProcedure
    .input(z.object({ eventId: z.number().int().positive(), sheetTabOverride: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const sheetTarget = await getEventSheetTarget(input.eventId);
      if (!sheetTarget.spreadsheetId) {
        return { sorted: 0, error: "No Google Sheet linked to this event. Import from a sheet URL first." };
      }
      if (input.sheetTabOverride) sheetTarget.sheetName = input.sheetTabOverride;
      const result = await sortSheetRows({
        target: { spreadsheetId: sheetTarget.spreadsheetId, sheetName: sheetTarget.sheetName },
      });
      return result;
    }),

  // ─── Clear all QR "used" flags in the database ────────────────────────────
  clearQRUsedInDB: publicProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId } = input;

      // 1. Clear bowlers.poolPartyUsed and bowlers.banquetUsed
      const bowlerResult = await rawExec(
        `UPDATE bowlers SET poolPartyUsed = FALSE, banquetUsed = FALSE WHERE eventId = ?`,
        [eventId]
      );

      // 2. Clear guest_pool_party_tokens used flags (join to bowlers for eventId scope)
      const guestTokenResult = await rawExec(
        `UPDATE guest_pool_party_tokens gpt
         JOIN bowlers b ON gpt.bowlerId = b.id
         SET gpt.used = FALSE, gpt.usedAt = NULL, gpt.banquetUsed = FALSE, gpt.banquetUsedAt = NULL
         WHERE b.eventId = ?`,
        [eventId]
      );

      // 3. Clear guest_bowlers used flags
      const guestBowlerResult = await rawExec(
        `UPDATE guest_bowlers gb
         JOIN bowlers b ON gb.bowlerId = b.id
         SET gb.poolUsed = FALSE, gb.poolUsedAt = NULL, gb.banquetUsed = FALSE, gb.banquetUsedAt = NULL
         WHERE gb.eventId = ?`,
        [eventId]
      );

      // 4. Clear reentry_tokens used flags
      const reentryResult = await rawExec(
        `UPDATE reentry_tokens SET used = FALSE, usedAt = NULL WHERE eventId = ?`,
        [eventId]
      );

      return {
        bowlersCleared: bowlerResult.affectedRows,
        guestTokensCleared: guestTokenResult.affectedRows,
        guestBowlersCleared: guestBowlerResult.affectedRows,
        reentryTokensCleared: reentryResult.affectedRows,
      };
    }),

  // ─── VALIDATE SHEET VS DB ───────────────────────────────────────────────────────────
  // Reads the linked Google Sheet and compares every row that has a Bowler ID
  // in column A against the database record for that scantronId.
  // Returns a list of mismatches (name or lane differences).
  validateSheetVsDb: publicProcedure
    .input(z.object({ eventId: z.number(), sheetTabOverride: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await requireEdSession(ctx);

      const { eventId } = input;

      // Get sheet target for this event
      const target = await getEventSheetTarget(eventId);
      if (input.sheetTabOverride) target.sheetName = input.sheetTabOverride;
      if (!target.spreadsheetId || !target.sheetName) {
        throw new Error("Event not configured with a Google Sheet target.");
      }

      const sheetsClient = await getSheetsClient();
      if (!sheetsClient) {
        throw new Error("Google Sheets client not available.");
      }

      // Fetch all rows from the sheet (A:K covers through Last Name)
      const resp = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: target.spreadsheetId,
        range: `'${target.sheetName}'!A:K`,
      });
      const sheetRows = resp.data.values ?? [];

      // Load all bowlers for this event indexed by scantronId
      const dbBowlers = await rawQuery(
        `SELECT b.scantronId, b.legalFirstName, b.legalLastName, b.laneNumber
         FROM bowlers b
         WHERE b.eventId = ?`,
        [eventId]
      ) as Array<{
        scantronId: string | null;
        legalFirstName: string | null;
        legalLastName: string | null;
        laneNumber: number | null;
      }>;

      const dbMap = new Map<string, typeof dbBowlers[0]>();
      for (const b of dbBowlers) {
        if (b.scantronId) dbMap.set(b.scantronId.trim(), b);
      }

      const mismatches: Array<{
        sheetRow: number;
        bowlerId: string;
        sheetFirstName: string;
        sheetLastName: string;
        sheetLane: number | null;
        dbFirstName: string | null;
        dbLastName: string | null;
        dbLane: number | null;
        issues: string[];
      }> = [];

      const inSheetNotInDb: Array<{ sheetRow: number; bowlerId: string; sheetFirstName: string; sheetLastName: string }> = [];

      // Start at row index 1 to skip header
      for (let i = 1; i < sheetRows.length; i++) {
        const row = sheetRows[i];
        if (!row) continue;

        const bowlerId = (row[COLS.BOWLER_ID] ?? "").toString().trim();
        if (!bowlerId || !/^\d{10}$/.test(bowlerId)) continue; // skip rows without a valid 10-digit ID

        const sheetFirst = (row[COLS.FIRST_NAME] ?? "").toString().trim().toLowerCase();
        const sheetLast  = (row[COLS.LAST_NAME]  ?? "").toString().trim().toLowerCase();
        const sheetLane  = parseInt((row[COLS.LANE] ?? "").toString().trim(), 10);
        const sheetLaneNum = isNaN(sheetLane) ? null : sheetLane;

        const dbRow = dbMap.get(bowlerId);
        if (!dbRow) {
          // ID exists in sheet but not in DB
          inSheetNotInDb.push({
            sheetRow: i + 1,
            bowlerId,
            sheetFirstName: (row[COLS.FIRST_NAME] ?? "").toString().trim(),
            sheetLastName:  (row[COLS.LAST_NAME]  ?? "").toString().trim(),
          });
          continue;
        }

        const issues: string[] = [];

        const dbFirst = (dbRow.legalFirstName ?? "").trim().toLowerCase();
        const dbLast  = (dbRow.legalLastName ?? "").trim().toLowerCase();

        if (sheetFirst && dbFirst && sheetFirst !== dbFirst) {
          issues.push(`First name: sheet="${(row[COLS.FIRST_NAME] ?? "").toString().trim()}" db="${dbRow.legalFirstName ?? ""}"`);
        }
        if (sheetLast && dbLast && sheetLast !== dbLast) {
          issues.push(`Last name: sheet="${(row[COLS.LAST_NAME] ?? "").toString().trim()}" db="${dbRow.legalLastName ?? ""}"`);
        }
        if (sheetLaneNum !== null && dbRow.laneNumber !== null && sheetLaneNum !== dbRow.laneNumber) {
          issues.push(`Lane: sheet=${sheetLaneNum} db=${dbRow.laneNumber}`);
        }

        if (issues.length > 0) {
          mismatches.push({
            sheetRow: i + 1,
            bowlerId,
            sheetFirstName: (row[COLS.FIRST_NAME] ?? "").toString().trim(),
            sheetLastName:  (row[COLS.LAST_NAME]  ?? "").toString().trim(),
            sheetLane: sheetLaneNum,
            dbFirstName: dbRow.legalFirstName ?? null,
            dbLastName:  dbRow.legalLastName ?? null,
            dbLane: dbRow.laneNumber,
            issues,
          });
        }
      }

      return {
        totalSheetRows: sheetRows.length - 1,
        totalWithId: dbMap.size,
        mismatches,
        inSheetNotInDb,
      };
    }),

  /**
   * Export bowler data AND write the same data back to the configured Google Sheet tab.
   * Returns the CSV string so the browser can trigger a download immediately.
   *
   * exportType:
   *   "full"       — all bowlers (name, phone, email, center, team, status, hotel, lane, squad)
   *   "by_center"  — same data grouped by center → team → name
   *   "checked_in" — only checked-in bowlers
   *   "audit_log"  — audit log rows (download only, no sheet write-back)
   *
   * Sheet write-back updates: Bowler ID (A), Phone (B), Email (C),
   *   T-Shirt Size (R), Check-in (T), Check-out (U) for each matched row.
   */
  exportAndWriteBack: publicProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      exportType: z.enum(["full", "by_center", "checked_in", "audit_log"]),
      sheetTabOverride: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireEdSession(ctx);
      const { eventId, exportType, sheetTabOverride } = input;

      // ── 1. Fetch bowlers ──────────────────────────────────────────────────
      const bowlers = await rawQuery<{
        id: number;
        scantronId: string | null;
        legalFirstName: string;
        legalLastName: string;
        phone: string | null;
        email: string | null;
        centerName: string | null;
        teamName: string | null;
        teamCode: string | null;
        registrationStatus: string | null;
        checkinDate: string | null;
        checkoutDate: string | null;
        roomType: string | null;
        banquetAmount: string | null;
        tshirtSize: string | null;
        laneNumber: number | null;
        squadTime: string | null;
        bestAverage: number | null;
        under21: boolean | null;
      }>(
        `SELECT b.id, b.scantronId, b.legalFirstName, b.legalLastName, b.phone, b.email,
                bc.centerName, t.teamName, t.teamCode,
                b.registrationStatus, b.tshirtSize, b.laneNumber, b.squadTime,
                b.bestAverage, b.under21,
                hr.checkinDate, hr.checkoutDate, hr.roomType,
                pr.banquetAmount
         FROM bowlers b
         LEFT JOIN bowling_centers bc ON b.centerId = bc.id
         LEFT JOIN teams t ON b.teamId = t.id
         LEFT JOIN hotel_records hr ON hr.bowlerId = b.id
         LEFT JOIN payment_records pr ON pr.bowlerId = b.id
         WHERE b.eventId = ?
         ORDER BY bc.centerName, t.teamCode, b.legalLastName, b.legalFirstName`,
        [eventId]
      );

      // ── 2. Build CSV ──────────────────────────────────────────────────────
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      let csvHeaders: string[];
      let csvRows: string[][];

      if (exportType === "full" || exportType === "by_center") {
        csvHeaders = ["ScantronID","FirstName","LastName","Phone","Email","Center","Team","Status","CheckIn","CheckOut","Room","Banquet","TShirtSize","LaneAssignment","SquadTime","Average","Under21"];
        const sorted = [...bowlers].sort((a, b) => {
          const ca = (a.centerName ?? "").toLowerCase();
          const cb = (b.centerName ?? "").toLowerCase();
          if (ca !== cb) return ca < cb ? -1 : 1;
          const ta = parseInt(a.teamCode ?? "9999", 10);
          const tb = parseInt(b.teamCode ?? "9999", 10);
          if (ta !== tb) return ta - tb;
          const la = (a.legalLastName ?? "").toLowerCase();
          const lb = (b.legalLastName ?? "").toLowerCase();
          return la < lb ? -1 : la > lb ? 1 : 0;
        });
        if (exportType === "by_center") {
          csvRows = [];
          let lastCenter = "";
          for (const b of sorted) {
            const c = b.centerName ?? "Unknown";
            if (c !== lastCenter) {
              csvRows.push([`=== ${c} ===`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
              lastCenter = c;
            }
            csvRows.push([b.scantronId??"",b.legalFirstName,b.legalLastName,b.phone??"",b.email??"",b.centerName??"",b.teamName??"",b.registrationStatus??"",b.checkinDate??"",b.checkoutDate??"",b.roomType??"",b.banquetAmount??"",b.tshirtSize??"",String(b.laneNumber??""),b.squadTime??"",String(b.bestAverage??""),b.under21?"Yes":"No"]);
          }
        } else {
          csvRows = sorted.map((b) => [b.scantronId??"",b.legalFirstName,b.legalLastName,b.phone??"",b.email??"",b.centerName??"",b.teamName??"",b.registrationStatus??"",b.checkinDate??"",b.checkoutDate??"",b.roomType??"",b.banquetAmount??"",b.tshirtSize??"",String(b.laneNumber??""),b.squadTime??"",String(b.bestAverage??""),b.under21?"Yes":"No"]);
        }
      } else if (exportType === "checked_in") {
        const checked = bowlers.filter((b) => b.registrationStatus === "checked_in");
        csvHeaders = ["ScantronID","FirstName","LastName","Center","Team","Phone","LaneAssignment","SquadTime"];
        csvRows = checked.map((b) => [b.scantronId??"",b.legalFirstName,b.legalLastName,b.centerName??"",b.teamName??"",b.phone??"",String(b.laneNumber??""),b.squadTime??""]);
      } else {
        // audit_log — download only, no sheet write-back
        const logs = await rawQuery<Record<string, unknown>>(
          `SELECT createdAt, action, actorRole, actorId, targetType, targetId, details
           FROM audit_log WHERE eventId = ? ORDER BY createdAt DESC LIMIT 5000`,
          [eventId]
        );
        csvHeaders = ["Timestamp","Action","ActorRole","ActorId","TargetType","TargetId","Details"];
        csvRows = logs.map((l) => [l.createdAt,l.action,l.actorRole,l.actorId,l.targetType,l.targetId,l.details].map(String));
        const csv = [csvHeaders.map(esc).join(","), ...csvRows.map((r) => r.map(esc).join(","))].join("\n");
        return { csv, rowCount: csvRows.length, sheetWritten: 0, sheetErrors: 0, sheetSkipped: 0 };
      }

      // Build CSV (skip section-header rows that start with "===")
      const dataRows = csvRows.filter((r) => !r[0].startsWith("==="));
      const csv = [csvHeaders.map(esc).join(","), ...dataRows.map((r) => r.map(esc).join(","))].join("\n");

      // ── 3. Write back to Google Sheet ─────────────────────────────────────
      const sheetTarget = await getEventSheetTarget(eventId);
      if (sheetTabOverride) sheetTarget.sheetName = sheetTabOverride;

      let sheetWritten = 0;
      let sheetErrors = 0;
      let sheetSkipped = 0;

      if (sheetTarget.spreadsheetId && sheetTarget.sheetName) {
        const sheets = await getSheetsClient();
        if (sheets) {
          // Read the current sheet to build a name+lane → row index map
          let sheetRows: string[][] = [];
          try {
            const resp = await sheets.spreadsheets.values.get({
              spreadsheetId: sheetTarget.spreadsheetId,
              range: `'${sheetTarget.sheetName}'!A:U`,
            });
            sheetRows = (resp.data.values ?? []) as string[][];
          } catch (err) {
            console.error("[exportAndWriteBack] Could not read sheet:", err);
          }

          if (sheetRows.length > 1) {
            // Build first+last+lane → 1-indexed row number map
            const rowMap = new Map<string, number>();
            for (let i = 1; i < sheetRows.length; i++) {
              const row = sheetRows[i];
              const fn = (row[9] ?? "").toLowerCase().trim();  // col J = First Name
              const ln = (row[10] ?? "").toLowerCase().trim(); // col K = Last Name
              const lane = (row[4] ?? "").trim();               // col E = Lane
              if (fn && ln) {
                rowMap.set(`${fn}|${ln}|${lane}`, i + 1);
                rowMap.set(`${fn}|${ln}|`, i + 1); // fallback without lane
              }
            }

            const updateData: { range: string; values: string[][] }[] = [];
            const bowlersToWrite = exportType === "checked_in"
              ? bowlers.filter((b) => b.registrationStatus === "checked_in")
              : bowlers;

            for (const b of bowlersToWrite) {
              const fn = b.legalFirstName.toLowerCase().trim();
              const ln = b.legalLastName.toLowerCase().trim();
              const lane = String(b.laneNumber ?? "");
              const rowNum = rowMap.get(`${fn}|${ln}|${lane}`) ?? rowMap.get(`${fn}|${ln}|`);
              if (!rowNum) { sheetSkipped++; continue; }

              const tab = sheetTarget.sheetName!;
              if (b.scantronId)   updateData.push({ range: `'${tab}'!A${rowNum}`, values: [[b.scantronId]] });
              if (b.phone)        updateData.push({ range: `'${tab}'!B${rowNum}`, values: [[b.phone]] });
              if (b.email)        updateData.push({ range: `'${tab}'!C${rowNum}`, values: [[b.email]] });
              if (b.tshirtSize)   updateData.push({ range: `'${tab}'!R${rowNum}`, values: [[b.tshirtSize]] });
              if (b.checkinDate)  updateData.push({ range: `'${tab}'!T${rowNum}`, values: [[b.checkinDate]] });
              if (b.checkoutDate) updateData.push({ range: `'${tab}'!U${rowNum}`, values: [[b.checkoutDate]] });
              sheetWritten++;
            }

            // Execute in batches of 100 ranges to stay within API limits
            const BATCH = 100;
            for (let i = 0; i < updateData.length; i += BATCH) {
              const chunk = updateData.slice(i, i + BATCH);
              try {
                await sheets.spreadsheets.values.batchUpdate({
                  spreadsheetId: sheetTarget.spreadsheetId,
                  requestBody: { valueInputOption: "RAW", data: chunk },
                });
              } catch (err) {
                console.error("[exportAndWriteBack] batchUpdate error:", err);
                sheetErrors += chunk.length;
                sheetWritten = Math.max(0, sheetWritten - chunk.length);
              }
            }
          }
        }
      }

      return { csv, rowCount: dataRows.length, sheetWritten, sheetErrors, sheetSkipped };
    }),

  // ─── Hotel Room ID Planner (Event Director only) ─────────────────────────
  previewHotelRoomIds: publicProcedure
    .input(z.object({ eventId: z.number().int().positive(), sheetTabOverride: z.string().trim().min(1).optional() }))
    .query(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      const data = await loadRoomPlanSheetData(input.eventId, input.sheetTabOverride);
      return {
        sheetName: data.sheetName,
        sourceHash: data.sourceHash,
        existingRoomIdColumn: data.headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(ROOM_ID_HEADER)) >= 0,
        summary: data.plan.summary,
        assignments: data.plan.assignments,
        groups: data.plan.groups,
      };
    }),

  applyHotelRoomIds: publicProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      sourceHash: z.string().length(64),
      confirmation: z.literal("APPLY"),
      sheetTabOverride: z.string().trim().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      const data = await loadRoomPlanSheetData(input.eventId, input.sheetTabOverride);
      if (data.sourceHash !== input.sourceHash) {
        throw new Error("The selected sheet changed after preview. Re-run the room plan before writing any Hotel Room IDs.");
      }
      const sheets = await getSheetsClient();
      if (!sheets) throw new Error("Google Sheets connection is unavailable.");
      let roomIdColumn = data.headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(ROOM_ID_HEADER));

      if (roomIdColumn < 0) {
        roomIdColumn = data.headers.length;
        const workbook = await sheets.spreadsheets.get({ spreadsheetId: data.spreadsheetId, fields: "sheets.properties" });
        const properties = (workbook.data.sheets ?? []).find((sheet) => sheet.properties?.title === data.sheetName)?.properties;
        if (properties?.sheetId === undefined) throw new Error("The selected sheet tab was not found.");
        const currentColumns = properties.gridProperties?.columnCount ?? 0;
        if (currentColumns <= roomIdColumn) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: data.spreadsheetId,
            requestBody: {
              requests: [{ appendDimension: { sheetId: properties.sheetId, dimension: "COLUMNS", length: roomIdColumn - currentColumns + 1 } }],
            },
          });
        }
      }

      const roomIdColumnLetter = columnLetter(roomIdColumn);
      const updates = [
        { range: `'${data.sheetName}'!${roomIdColumnLetter}1`, values: [[ROOM_ID_HEADER]] },
        ...data.plan.assignments.map((assignment) => ({
          range: `'${data.sheetName}'!${roomIdColumnLetter}${assignment.rowNumber}`,
          values: [[assignment.roomId]],
        })),
      ];
      const batchSize = 100;
      for (let index = 0; index < updates.length; index += batchSize) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: data.spreadsheetId,
          requestBody: { valueInputOption: "RAW", data: updates.slice(index, index + batchSize) },
        });
      }
      await recordSheetSync(input.eventId);
      return {
        sheetName: data.sheetName,
        roomIdColumn: roomIdColumnLetter,
        assignedRows: data.plan.assignments.length,
        ...data.plan.summary,
      };
    }),
});
