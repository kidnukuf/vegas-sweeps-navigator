import { z } from "zod";
import { randomBytes } from "crypto";
import { publicProcedure, router } from "../_core/trpc";
import { getEventSheetTarget, rawQuery } from "../db";
import { writeClaimCodesToSheet } from "../googleSheets";

// Unambiguous alphabet: no 0/O/1/I/L to avoid paper-to-keyboard mistakes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomSegment(len: number): string {
  return Array.from(randomBytes(len), (value) => ALPHABET[value % ALPHABET.length]).join("");
}

// e.g. BOB-7F3K
function makeCode(): string {
  return `BOB-${randomSegment(4)}`;
}

type BowlerRow = {
  id: number;
  legalFirstName: string | null;
  legalLastName: string | null;
  centerName: string | null;
  teamName: string | null;
  scantronId: string | null;
  laneNumber: number | null;
  teamCode: string | null;
};

export async function syncCodesToSheet(eventId: number, sheetTabOverride?: string) {
  const rows = await rawQuery<BowlerRow & { code: string }>(
    `SELECT c.code, b.id, b.legalFirstName, b.legalLastName, b.laneNumber,
            bc.centerName AS centerName, t.teamName AS teamName, t.teamCode, b.scantronId
     FROM bowler_claim_codes c
     JOIN bowlers b ON b.id = c.bowlerId
     LEFT JOIN teams t ON t.id = b.teamId
     LEFT JOIN bowling_centers bc ON bc.id = b.centerId
     WHERE c.eventId = ? AND c.status <> 'void'
     ORDER BY t.teamName ASC, b.legalLastName ASC, b.legalFirstName ASC`,
    [eventId],
  );
  const target = await getEventSheetTarget(eventId);
  if (sheetTabOverride) target.sheetName = sheetTabOverride;
  return writeClaimCodesToSheet(rows.map((row) => ({
    firstName: row.legalFirstName ?? "",
    lastName: row.legalLastName ?? "",
    laneNumber: row.laneNumber ?? null,
    centerName: row.centerName ?? "",
    teamCode: row.teamCode ?? "",
    code: row.code,
  })), target);
}

/**
 * Application-side post-import workflow: mint codes only for bowlers that have
 * never received one, then write every active code to the configured BL column.
 * The function is idempotent, so re-importing a roster cannot replace a code
 * that has already been distributed or redeemed.
 */
export async function ensureClaimCodesForEvent(eventId: number, sheetTabOverride?: string) {
  const bowlers = await rawQuery<{ id: number }>(
    `SELECT b.id FROM bowlers b
     WHERE b.eventId = ?
       AND b.id NOT IN (
         SELECT bowlerId FROM bowler_claim_codes WHERE eventId = ?
       )`,
    [eventId, eventId]
  );

  const existing = await rawQuery<{ code: string }>(`SELECT code FROM bowler_claim_codes`, []);
  const used = new Set(existing.map((row) => row.code));
  const now = Date.now();
  let created = 0;

  for (const bowler of bowlers) {
    let code = makeCode();
    let guard = 0;
    while (used.has(code) && guard < 1000) {
      code = makeCode();
      guard++;
    }
    if (used.has(code)) throw new Error("Could not create a unique claim code. Please try again.");
    used.add(code);
    await rawQuery(
      `INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, createdAt)
       VALUES (?, ?, ?, 'unused', ?)`,
      [eventId, bowler.id, code, now]
    );
    created++;
  }

  const total = await rawQuery<{ c: number }>(
    `SELECT COUNT(*) AS c FROM bowler_claim_codes WHERE eventId = ?`,
    [eventId]
  );
  const sheet = await syncCodesToSheet(eventId, sheetTabOverride);
  return { created, totalForEvent: total[0]?.c ?? 0, sheet };
}

export const claimCodesRouter = router({
  // ── ED: generate one unique unused code per bowler that doesn't already have one ──
  generateForEvent: publicProcedure
    .input(z.object({ eventId: z.number(), regenerateUnused: z.boolean().default(false), sheetTabOverride: z.string().optional() }))
    .mutation(async ({ input }) => {
      // Optionally clear existing UNUSED codes first (never touches redeemed ones)
      if (input.regenerateUnused) {
        await rawQuery(
          `DELETE FROM bowler_claim_codes WHERE eventId = ? AND status = 'unused'`,
          [input.eventId]
        );
      }

      return ensureClaimCodesForEvent(input.eventId, input.sheetTabOverride);
    }),

  // ── ED: full list for printable distribution sheet (grouped client-side by team) ──
  listForEvent: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const rows = await rawQuery<
        BowlerRow & { code: string; status: string; codeId: number }
      >(
        `SELECT c.id AS codeId, c.code, c.status,
                b.id, b.legalFirstName, b.legalLastName,
                bc.centerName AS centerName, t.teamName AS teamName, b.scantronId
         FROM bowler_claim_codes c
         JOIN bowlers b ON b.id = c.bowlerId
         LEFT JOIN teams t ON t.id = b.teamId
         LEFT JOIN bowling_centers bc ON bc.id = b.centerId
         WHERE c.eventId = ?
         ORDER BY t.teamName ASC, b.legalLastName ASC, b.legalFirstName ASC`,
        [input.eventId]
      );
      return rows.map((r) => ({
        codeId: r.codeId,
        code: r.code,
        status: r.status,
        bowlerId: r.id,
        firstName: r.legalFirstName ?? "",
        lastName: r.legalLastName ?? "",
        center: r.centerName ?? "",
        team: r.teamName ?? "",
        scantronId: r.scantronId ?? "",
      }));
    }),

  // ── ED: lookup by name OR code (lost-code support) ──
  lookup: publicProcedure
    .input(z.object({ eventId: z.number(), query: z.string().min(1) }))
    .query(async ({ input }) => {
      const q = `%${input.query.trim()}%`;
      const codeExact = input.query.trim().toUpperCase();
      const rows = await rawQuery<
        BowlerRow & { code: string; status: string; codeId: number }
      >(
        `SELECT c.id AS codeId, c.code, c.status,
                b.id, b.legalFirstName, b.legalLastName,
                bc.centerName AS centerName, t.teamName AS teamName, b.scantronId
         FROM bowler_claim_codes c
         JOIN bowlers b ON b.id = c.bowlerId
         LEFT JOIN teams t ON t.id = b.teamId
         LEFT JOIN bowling_centers bc ON bc.id = b.centerId
         WHERE c.eventId = ?
           AND (c.code = ? OR b.legalFirstName LIKE ? OR b.legalLastName LIKE ?
                OR CONCAT(b.legalFirstName,' ',b.legalLastName) LIKE ?)
         ORDER BY b.legalLastName ASC
         LIMIT 50`,
        [input.eventId, codeExact, q, q, q]
      );
      return rows.map((r) => ({
        codeId: r.codeId,
        code: r.code,
        status: r.status,
        bowlerId: r.id,
        firstName: r.legalFirstName ?? "",
        lastName: r.legalLastName ?? "",
        center: r.centerName ?? "",
        team: r.teamName ?? "",
      }));
    }),

  // ── ED: reissue a lost code (voids the old, mints a new unused one for same bowler) ──
  reissue: publicProcedure
    .input(z.object({ eventId: z.number(), codeId: z.number() }))
    .mutation(async ({ input }) => {
      const cur = await rawQuery<{ id: number; bowlerId: number; status: string }>(
        `SELECT id, bowlerId, status FROM bowler_claim_codes WHERE id = ? AND eventId = ? LIMIT 1`,
        [input.codeId, input.eventId]
      );
      const row = cur[0];
      if (!row) {
        return { ok: false, reason: "Code not found." as const };
      }
      // Void the old code
      await rawQuery(
        `UPDATE bowler_claim_codes SET status = 'void' WHERE id = ?`,
        [input.codeId]
      );
      // Mint a fresh unique code for the same bowler
      const existing = await rawQuery<{ code: string }>(`SELECT code FROM bowler_claim_codes`, []);
      const used = new Set(existing.map((r) => r.code));
      let code = makeCode();
      let guard = 0;
        while (used.has(code) && guard < 1000) {
          code = makeCode();
          guard++;
        }
        if (used.has(code)) throw new Error("Could not create a unique claim code. Please try again.");
      await rawQuery(
        `INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, reissuedFromId, createdAt)
         VALUES (?, ?, ?, 'unused', ?, ?)`,
        [input.eventId, row.bowlerId, code, input.codeId, Date.now()]
      );
      const sheet = await syncCodesToSheet(input.eventId);
      return { ok: true as const, newCode: code, sheet };
    }),

  // ── ED: re-write active codes to column BL without generating new codes ─────
  syncToSheet: publicProcedure
    .input(z.object({ eventId: z.number(), sheetTabOverride: z.string().optional() }))
    .mutation(async ({ input }) => syncCodesToSheet(input.eventId, input.sheetTabOverride)),
});
