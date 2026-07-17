import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { rawQuery } from "../db";
import { getSheetsClient } from "../googleSheets";

// Column indices for Master Sheet (0-indexed)
// Based on actual Google Sheet structure: https://docs.google.com/spreadsheets/d/1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM
const COLS = {
  BOWLER_ID: 0,           // Column A
  PHONE: 1,               // Column B
  EMAIL: 2,               // Column C
  SQUAD_TIME: 3,          // Column D
  LANE: 4,                // Column E
  CENTER: 5,              // Column F
  TEAM_CODE: 6,           // Column G
  CAPTAIN: 7,             // Column H
  FIRST_NAME: 8,          // Column I
  LAST_NAME: 9,           // Column J
  UNDER_21: 10,           // Column K
  SANCTION: 11,           // Column L
  GAMES: 12,              // Column M
  BEST_AVG: 13,           // Column N
  TEAM_NAME: 14,          // Column O
  LEAGUE_MEMBER: 15,      // Column P
  HOTEL_CONFIRMATION: 16, // Column Q
  TSHIRT_SIZE: 17,        // Column R (was 2, now 17)
  CHECK_IN: 18,           // Column S
  CHECK_OUT: 19,          // Column T
  ROOMMATE_FIRST: 20,     // Column U
  ROOMMATE_LAST: 21,      // Column V
  HOTEL_REG: 22,          // Column W
  COORDINATOR: 23,        // Column X
  POOL_USED: 24,          // Column Y
  EXTRA_BANQUET_QR: 25,   // Column Z
  EXTRA_BNQ_USED: 26,     // Column AA
  BANQUET_QR: 27,         // Column AB
  BANQUET_USED: 28,       // Column AC
  POOL_QR: 29,            // Column AD
  POOL_CONFIRMED: 30,     // Column AE
  GUEST_POOL_A: 31,       // Column AF
  GUEST_POOL_A_USED: 32,  // Column AG
  GUEST_POOL_B: 33,       // Column AH
  GUEST_POOL_B_USED: 34,  // Column AI
  GUEST_BANQUET_QR: 35,   // Column AJ
  SQUAD_TIME_2: 36,       // Column AK
  LANE_2: 37,             // Column AL
  POOL_USED_2: 38,        // Column AM
  BANQUET_USED_2: 39,     // Column AN
  BANQUET_QR_A: 35,       // Column AJ (alias)
  BANQUET_QR_B: 35,       // Column AJ (placeholder)
  SECOND_CENTER: 40,      // Column AO (placeholder)
  SECOND_TEAM: 41,        // Column AP (placeholder)
  SECOND_SQUAD: 42,       // Column AQ (placeholder)
  GUEST_POOL_USED: 32,    // Column AG (alias)
  GUEST_POOL_QR: 31,      // Column AF (alias)
  POOL_ENTRY_A_USED: 32,  // Column AG (alias)
  POOL_QR_A: 31,          // Column AF (alias)
  POOL_ENTRY_B_USED: 34,  // Column AI (alias)
  POOL_QR_B: 33,          // Column AH (alias)
  LEAGUE: 15,             // Column P (alias for LEAGUE_MEMBER)
  BANQUET_TABLE: 25,      // Column Z (placeholder)
  EXTRA_BANQUET: 25,      // Column Z (alias)
  BANQUET_QR_USED: 28,    // Column AC (alias for BANQUET_USED)
  CODE: 0,                // Column A (placeholder)
  DATE_1: 0,              // Column A (placeholder)
  DATE_2: 0,              // Column A (placeholder)
  Q1_QUESTION: 42,        // Column AQ
  Q1_ANSWER: 43,          // Column AR
  Q2_QUESTION: 44,        // Column AS
  Q2_ANSWER: 45,          // Column AT
  Q3_QUESTION: 46,        // Column AU
  Q3_ANSWER: 47,          // Column AV
  Q4_QUESTION: 48,        // Column AW
  Q4_ANSWER: 49,          // Column AX
  Q5_QUESTION: 50,        // Column AY
  Q5_ANSWER: 51,          // Column AZ
  Q6_QUESTION: 52,        // Column BA
  Q6_ANSWER: 53,          // Column BB
  Q7_QUESTION: 54,        // Column BC
  Q7_ANSWER: 55,          // Column BD
  Q8_QUESTION: 56,        // Column BE
  Q8_ANSWER: 57,          // Column BF
  Q9_QUESTION: 58,        // Column BG
  Q9_ANSWER: 59,          // Column BH
  Q10_QUESTION: 60,       // Column BI
  Q10_ANSWER: 61,         // Column BJ
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

export const masterSheetRouter = router({
  importMasterSheet: protectedProcedure
    .input(z.object({ eventId: z.number(), rows: z.array(z.record(z.string(), z.unknown())) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

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
              centerId = centerResult[0].id;
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

  detectChanges: protectedProcedure
    .input(z.object({ eventId: z.number(), rows: z.array(z.record(z.string(), z.unknown())) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

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

  exportToGoogleSheetFormat: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

      const { eventId } = input;

      // Get event to find Google Sheet
      const event = await rawQuery(`SELECT sheetSpreadsheetId, sheetTabName FROM events WHERE id = ?`, [eventId]);
      if (!event || !event[0]?.sheetSpreadsheetId) {
        throw new Error("Event not configured with Google Sheet");
      }

      const { sheetSpreadsheetId, sheetTabName } = event[0];

      // Fetch all data from Google Sheet (columns A-BI)
      const sheetsClient = await getSheetsClient();
      if (!sheetsClient) {
        throw new Error("Google Sheets client not available");
      }

      const resp = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: sheetSpreadsheetId,
        range: `'${sheetTabName}'!A:BI`,
      });

      const allRows = (resp.data?.values as string[][]) || [];
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

  exportForRaspberryPi: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

      const { eventId } = input;

      const bowlers = await rawQuery(`SELECT b.id, b.scantronId, b.firstName, b.lastName, b.laneNumber, b.centerName, b.teamName, b.squadTime FROM bowlers b WHERE b.eventId = ? ORDER BY b.squadTime, b.laneNumber`, [eventId]);

      const headers = ["Bowler ID", "First Name", "Last Name", "Lane", "Center", "Team", "Squad Time"];
      const rows = bowlers.map((b: any) => [String(b.scantronId || ""), String(b.firstName || ""), String(b.lastName || ""), String(b.laneNumber || ""), String(b.centerName || ""), String(b.teamName || ""), String(b.squadTime || "")]);

      const csvContent = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");

      return { csv: csvContent, rowCount: rows.length };
    }),

  exportFinalResults: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

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

  getAllBowlersWithQRCodes: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

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
});
