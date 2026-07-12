import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { rawQuery } from "../db";

// Column indices for Master Sheet (0-indexed)
// Based on actual Google Sheet structure: https://docs.google.com/spreadsheets/d/1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM
const COLS = {
  BOWLER_ID: 0,           // Column A
  TEAM_NAME: 1,           // Column B
  TSHIRT_SIZE: 2,         // Column C
  CODE: 3,                // Column D (identifier/code)
  DATE_1: 4,              // Column E (event date)
  DATE_2: 5,              // Column F (event date)
  FIRST_NAME: 6,          // Column G
  LAST_NAME: 7,           // Column H
  PHONE: 8,               // Column I
  EMAIL: 9,               // Column J
  LEAGUE: 10,             // Column K
  TEAM_CODE: 11,          // Column L
  CENTER: 12,             // Column M
  SQUAD_TIME: 13,         // Column N
  LANE: 14,               // Column O
  UNDER_21: 15,           // Column P
  SANCTION: 16,           // Column Q
  GAMES: 17,              // Column R
  BEST_AVG: 18,           // Column S
  LEAGUE_MEMBER: 19,      // Column T
  HOTEL_CONFIRMATION: 20, // Column U
  CHECK_IN: 21,           // Column V
  CHECK_OUT: 22,          // Column W
  ROOMMATE_FIRST: 23,     // Column X
  ROOMMATE_LAST: 24,      // Column Y
  BANQUET_TABLE: 25,      // Column Z
  EXTRA_BANQUET: 26,      // Column AA
  BANQUET_QR_USED: 27,    // Column AB
  BANQUET_QR: 28,         // Column AC
  POOL_ENTRY_A_USED: 29,  // Column AD
  POOL_QR_A: 30,          // Column AE
  POOL_ENTRY_B_USED: 31,  // Column AF
  POOL_QR_B: 32,          // Column AG
  BANQUET_QR_A: 33,       // Column AH
  BANQUET_QR_B: 34,       // Column AI
  SECOND_CENTER: 35,      // Column AJ
  SECOND_TEAM: 36,        // Column AK
  SECOND_SQUAD: 37,       // Column AL
  POOL_QR: 38,            // Column AM
  GUEST_POOL_USED: 39,    // Column AN
  GUEST_POOL_QR: 40,      // Column AO
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

          await rawQuery(
            `INSERT INTO bowlers (eventId, firstName, lastName, phone, email, squadTime, laneNumber, centerName, league, teamCode, teamName, under21, sanction, games, bestAvg, leagueMember, tshirtSize, hotelConfirmation, hotelCheckin, hotelCheckout, roommateFirst, roommateLast, banquetTable, extraBanquet, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE phone = VALUES(phone), email = VALUES(email), squadTime = VALUES(squadTime), laneNumber = VALUES(laneNumber), centerName = VALUES(centerName), league = VALUES(league), teamCode = VALUES(teamCode), teamName = VALUES(teamName), under21 = VALUES(under21), sanction = VALUES(sanction), games = VALUES(games), bestAvg = VALUES(bestAvg), leagueMember = VALUES(leagueMember), tshirtSize = VALUES(tshirtSize), hotelConfirmation = VALUES(hotelConfirmation), hotelCheckin = VALUES(hotelCheckin), hotelCheckout = VALUES(hotelCheckout), roommateFirst = VALUES(roommateFirst), roommateLast = VALUES(roommateLast), banquetTable = VALUES(banquetTable), extraBanquet = VALUES(extraBanquet), updatedAt = NOW()`,
            [eventId, sheetRow.firstName, sheetRow.lastName, sheetRow.phone, sheetRow.email, sheetRow.squadTime, sheetRow.laneNumber, sheetRow.centerName, sheetRow.league, sheetRow.teamCode, sheetRow.teamName, sheetRow.under21 ? 1 : 0, sheetRow.sanction, sheetRow.games, sheetRow.bestAvg, sheetRow.leagueMember, sheetRow.tshirtSize, sheetRow.hotelConfirmation, sheetRow.hotelCheckin, sheetRow.hotelCheckout, sheetRow.roommateFirst, sheetRow.roommateLast, sheetRow.banquetTable, sheetRow.extraBanquet]
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

      const bowlers = await rawQuery(`SELECT * FROM bowlers WHERE eventId = ? ORDER BY squadTime, laneNumber`, [eventId]);

      // Headers match the actual Google Sheet structure
      const headers = [
        "Bowler ID",
        "Team Name",
        "T-Shirt Size",
        "Code",
        "Date 1",
        "Date 2",
        "First Name",
        "Last Name",
        "Phone",
        "Email",
        "League",
        "Team Code",
        "Center",
        "Squad Time",
        "Lane",
        "Under 21",
        "Sanction",
        "Games",
        "Best Avg",
        "League Member",
        "Hotel Confirmation",
        "Check In",
        "Check Out",
        "Roommate First",
        "Roommate Last",
        "Banquet Table",
        "Extra Banquet",
        "Banquet QR Used",
        "Banquet QR",
        "Pool Entry A Used",
        "Pool QR A",
        "Pool Entry B Used",
        "Pool QR B",
        "Banquet QR A",
        "Banquet QR B",
        "Second Center",
        "Second Team",
        "Second Squad",
        "Pool QR",
        "Guest Pool Used",
        "Guest Pool QR",
      ];

      const rows = bowlers.map((b: any) => [
        String(b.scantronId || ""),
        String(b.teamName || ""),
        String(b.tshirtSize || ""),
        String(b.code || ""),
        String(b.date1 || ""),
        String(b.date2 || ""),
        String(b.firstName || ""),
        String(b.lastName || ""),
        String(b.phone || ""),
        String(b.email || ""),
        String(b.league || ""),
        String(b.teamCode || ""),
        String(b.centerName || ""),
        String(b.squadTime || ""),
        String(b.laneNumber || ""),
        b.under21 ? "Y" : "",
        String(b.sanction || ""),
        String(b.games || ""),
        String(b.bestAvg || ""),
        String(b.leagueMember || ""),
        String(b.hotelConfirmation || ""),
        String(b.hotelCheckin || ""),
        String(b.hotelCheckout || ""),
        String(b.roommateFirst || ""),
        String(b.roommateLast || ""),
        String(b.banquetTable || ""),
        String(b.extraBanquet || ""),
        String(b.banquetQrUsed || ""),
        String(b.banquetQr || ""),
        String(b.poolEntryAUsed || ""),
        String(b.poolQrA || ""),
        String(b.poolEntryBUsed || ""),
        String(b.poolQrB || ""),
        String(b.banquetQrA || ""),
        String(b.banquetQrB || ""),
        String(b.secondCenter || ""),
        String(b.secondTeam || ""),
        String(b.secondSquad || ""),
        String(b.poolQr || ""),
        String(b.guestPoolUsed || ""),
        String(b.guestPoolQr || ""),
      ]);

      const csvContent = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");

      return { csv: csvContent, rowCount: rows.length };
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
});
