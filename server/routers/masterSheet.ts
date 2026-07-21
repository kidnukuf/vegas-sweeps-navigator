import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { rawQuery, getEventSheetTarget, recordSheetSync } from "../db";
import { getSheetsClient, writeQRCodesToSheet, writeBowlerIdToSheet } from "../googleSheets";

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

      const resp = await (sheetsClient.spreadsheets.values.get as any)({
        spreadsheetId: sheetSpreadsheetId,
        range: `'${sheetTabName}'!A:BI`,
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

  /**
   * Bulk-sync all QR codes for an event to the Google Sheet.
   * Iterates every bowler that has at least one token (pool, banquet, or guest)
   * and writes all QR URLs in a single fire-and-forget batch per bowler.
   * Returns counts of bowlers synced, skipped (no tokens), and failed.
   */
  bulkSyncQRCodes: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

      const sheetTarget = await getEventSheetTarget(input.eventId);
      if (!sheetTarget.spreadsheetId || !sheetTarget.sheetName) {
        throw new Error("No Google Sheet configured for this event. Set the Sheet ID and Tab Name in Event Settings first.");
      }

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
  regenerateMissingTokens: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Admin only");

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
});
