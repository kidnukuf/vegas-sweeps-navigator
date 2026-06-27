import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";

// Unambiguous alphabet: no 0/O/1/I/L to avoid paper-to-keyboard mistakes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomSegment(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
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
};

export const claimCodesRouter = router({
  // ── ED: generate one unique unused code per bowler that doesn't already have one ──
  generateForEvent: publicProcedure
    .input(z.object({ eventId: z.number(), regenerateUnused: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      // Optionally clear existing UNUSED codes first (never touches redeemed ones)
      if (input.regenerateUnused) {
        await rawQuery(
          `DELETE FROM bowler_claim_codes WHERE eventId = ? AND status = 'unused'`,
          [input.eventId]
        );
      }

      // Bowlers in this event who do NOT yet have any claim code row
      const bowlers = await rawQuery<{ id: number }>(
        `SELECT b.id FROM bowlers b
         WHERE b.eventId = ?
           AND b.id NOT IN (
             SELECT bowlerId FROM bowler_claim_codes WHERE eventId = ?
           )`,
        [input.eventId, input.eventId]
      );

      // Preload existing codes to guarantee global uniqueness
      const existing = await rawQuery<{ code: string }>(
        `SELECT code FROM bowler_claim_codes`,
        []
      );
      const used = new Set(existing.map((r) => r.code));

      let created = 0;
      const now = Date.now();
      for (const b of bowlers) {
        let code = makeCode();
        let guard = 0;
        while (used.has(code) && guard < 50) {
          code = makeCode();
          guard++;
        }
        used.add(code);
        await rawQuery(
          `INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, createdAt)
           VALUES (?, ?, ?, 'unused', ?)`,
          [input.eventId, b.id, code, now]
        );
        created++;
      }

      const total = await rawQuery<{ c: number }>(
        `SELECT COUNT(*) AS c FROM bowler_claim_codes WHERE eventId = ?`,
        [input.eventId]
      );
      return { created, totalForEvent: total[0]?.c ?? 0 };
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
      while (used.has(code) && guard < 50) {
        code = makeCode();
        guard++;
      }
      await rawQuery(
        `INSERT INTO bowler_claim_codes (eventId, bowlerId, code, status, reissuedFromId, createdAt)
         VALUES (?, ?, ?, 'unused', ?, ?)`,
        [input.eventId, row.bowlerId, code, input.codeId, Date.now()]
      );
      return { ok: true as const, newCode: code };
    }),
});
