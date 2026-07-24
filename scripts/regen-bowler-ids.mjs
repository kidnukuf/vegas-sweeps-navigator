/**
 * regen-bowler-ids.mjs
 *
 * Regenerates all bowler scantronIds to the new 10-digit format:
 *   CC(2) + L(1) + EE(2) + TT(2) + X(1) + BB(2) = 10 digits
 *
 * CC = center code (already fixed to 01-17)
 * L  = league code (1 digit) — extracted from existing ID char [2]
 * EE = event code (2 digits) — extracted from existing ID chars [3-4]
 * TT = team code (2 digits) — from teams table
 * X  = bowling position within team (1-5) — from bowlerPosition column
 * BB = sequential bowler number within team (01-99) — re-derived from order
 *
 * For existing 9-char IDs (old format CC+L+EE+TT+BB):
 *   old: CC(2)+L(1)+EE(2)+TT(2)+BB(2) = 9 chars
 *   We extract L=char[2], EE=chars[3-4], TT=chars[5-6], old BB=chars[7-8]
 *   X comes from bowlerPosition DB column
 *   New BB = sequential counter per team (same as old BB if import was clean)
 *
 * Run: node scripts/regen-bowler-ids.mjs
 */

import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Build centerId → centerCode map ───────────────────────────────────────
const [centers] = await conn.query(
  "SELECT id, centerCode FROM bowling_centers ORDER BY centerCode"
);
const centerIdToCode = new Map(centers.map(c => [c.id, String(c.centerCode)]));

// ── 2. Build teamId → teamCode map ───────────────────────────────────────────
const [teams] = await conn.query("SELECT id, teamCode FROM teams");
const teamCodeMap = new Map(teams.map(t => [t.id, String(t.teamCode)]));

// ── 3. Get all bowlers ordered by centerId, teamId, bowlerPosition ────────────
const [bowlers] = await conn.query(
  `SELECT b.id, b.scantronId, b.centerId, b.teamId, b.eventId,
          b.bowlerPosition, b.legalFirstName, b.legalLastName
   FROM bowlers b
   ORDER BY b.centerId, b.teamId, b.bowlerPosition, b.id`
);

console.log(`Processing ${bowlers.length} bowlers...`);

// ── 4. Assign sequential BB per team ─────────────────────────────────────────
// Group by centerId+teamId to assign BB (sequential counter)
const teamSeqMap = new Map(); // "centerId-teamId" → counter

let updated = 0;
let skipped = 0;
let warned = 0;
const idMap = new Map(); // oldId → newId (for guest token update)

for (const b of bowlers) {
  const oldId = String(b.scantronId ?? "");
  const newCC = centerIdToCode.get(b.centerId);
  const teamCode = teamCodeMap.get(b.teamId);

  if (!newCC || !teamCode) {
    console.warn(`  SKIP (missing center/team) ${b.legalFirstName} ${b.legalLastName}`);
    skipped++;
    continue;
  }

  // Extract L and EE from existing ID (chars 2 and 3-4 of the 9-char old ID)
  // Old format: CC(2)+L(1)+EE(2)+TT(2)+BB(2) = 9 chars
  // If old ID is already 10 chars (already regenerated), use chars 2,3-4
  let L, EE;
  if (oldId.length >= 5) {
    L = oldId.slice(2, 3) || "1";
    EE = oldId.slice(3, 5) || "26";
  } else {
    L = "1";
    EE = "26";
  }

  // X = bowling position within team (1-5), from DB bowlerPosition
  const xRaw = String(b.bowlerPosition ?? "1").replace(/\D/g, "").slice(0, 1) || "1";
  const x = xRaw;

  // BB = sequential counter per team
  const teamKey = `${b.centerId}-${b.teamId}`;
  const seq = (teamSeqMap.get(teamKey) ?? 0) + 1;
  teamSeqMap.set(teamKey, seq);
  const BB = String(seq).padStart(2, "0");

  // TT = team code padded to 2 digits
  const TT = teamCode.padStart(2, "0");

  const newId = `${newCC}${L}${EE}${TT}${x}${BB}`;

  if (newId.length !== 10 || !/^\d{10}$/.test(newId)) {
    console.warn(`  WARN: "${newId}" is not 10 digits for ${b.legalFirstName} ${b.legalLastName} (CC=${newCC} L=${L} EE=${EE} TT=${TT} X=${x} BB=${BB})`);
    warned++;
    skipped++;
    continue;
  }

  if (oldId) idMap.set(oldId, newId);
  if (newId === oldId) { skipped++; continue; }

  await conn.query("UPDATE bowlers SET scantronId = ? WHERE id = ?", [newId, b.id]);
  console.log(`  ${b.legalFirstName} ${b.legalLastName}: ${oldId || "null"} → ${newId}`);
  updated++;
}

// ── 5. Update guest_pool_party_tokens.token ───────────────────────────────────
const [guestTokens] = await conn.query(
  "SELECT id, token FROM guest_pool_party_tokens"
);
let guestUpdated = 0;
for (const g of guestTokens) {
  const tok = String(g.token ?? "");
  if (tok.length < 2) continue;
  const suffix = tok.slice(-1); // letter suffix A, B, C...
  const oldSid = tok.slice(0, -1);
  const newSid = idMap.get(oldSid);
  if (newSid) {
    const newTok = newSid + suffix;
    await conn.query("UPDATE guest_pool_party_tokens SET token = ? WHERE id = ?", [newTok, g.id]);
    guestUpdated++;
    console.log(`  Guest token: ${tok} → ${newTok}`);
  }
}

console.log(`\n✅ Done:`);
console.log(`   Bowlers updated: ${updated}`);
console.log(`   Bowlers skipped (already correct or error): ${skipped}`);
console.log(`   Warnings (bad format): ${warned}`);
console.log(`   Guest tokens updated: ${guestUpdated}`);

// Print sample IDs
const [sample] = await conn.query(
  "SELECT scantronId, legalFirstName, legalLastName FROM bowlers LIMIT 10"
);
console.log("\nSample IDs after regeneration:");
sample.forEach(r => console.log(`  ${r.scantronId}  ${r.legalFirstName} ${r.legalLastName}`));

await conn.end();
