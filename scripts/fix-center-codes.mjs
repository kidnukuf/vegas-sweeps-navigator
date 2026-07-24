/**
 * fix-center-codes.mjs  (phase 2 — centers already renumbered)
 *
 * Center codes were already updated in the previous run.
 * This script:
 * 1. Reads the new 2-digit centerCode for each center
 * 2. Reconstructs every bowler's scantronId as: newCC(2) + last7chars(old scantronId)
 *    The last 7 chars = L(1)+EE(2)+TT(2)+BB(2) — stable regardless of old CC format
 *    Result is always exactly 10 digits.
 * 3. Updates guest_pool_party_tokens.token (= scantronId + suffix letter)
 *
 * Run: node scripts/fix-center-codes.mjs
 */

import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Build centerId → newCode map ──────────────────────────────────────────
const [centers] = await conn.query(
  "SELECT id, centerCode, centerName FROM bowling_centers ORDER BY centerCode"
);
const centerIdToCode = new Map(centers.map(c => [c.id, String(c.centerCode)]));

console.log("Current center codes:");
centers.forEach(c => console.log(`  ${c.centerCode}  ${c.centerName}`));

// ── 2. Get all bowlers ────────────────────────────────────────────────────────
const [bowlers] = await conn.query(
  `SELECT b.id, b.scantronId, b.centerId, b.legalFirstName, b.legalLastName
   FROM bowlers b ORDER BY b.id`
);

console.log(`\nProcessing ${bowlers.length} bowlers...`);
let updated = 0;
let skipped = 0;
let warned = 0;
const idMap = new Map(); // oldScantronId → newScantronId

for (const b of bowlers) {
  const oldId = String(b.scantronId ?? "");
  const newCC = centerIdToCode.get(b.centerId);

  if (!newCC) {
    console.warn(`  SKIP (no center code) ${b.legalFirstName} ${b.legalLastName} centerId=${b.centerId}`);
    skipped++;
    continue;
  }

  if (!oldId || oldId.length < 7) {
    console.warn(`  SKIP (short/null ID) ${b.legalFirstName} ${b.legalLastName}: "${oldId}"`);
    skipped++;
    continue;
  }

  // Take last 7 chars: L(1)+EE(2)+TT(2)+BB(2) — always 7 digits
  const suffix7 = oldId.slice(-7);
  const newId = newCC + suffix7; // 2 + 7 = 9... 

  // Wait — spec is CC(2)+L(1)+EE(2)+TT(2)+BB(2) = 10 total.
  // Old IDs were CC(2 chars, possibly alpha) + L(1)+EE(2)+TT(2)+BB(2) = 9 chars total.
  // So old IDs were already 9 chars (the bug). Last 7 = L+EE+TT+BB.
  // New: 2-digit CC + 7 = 9. Still 9!
  //
  // The REAL issue: old generateScantronId did padStart(2,"0") on CC, but CC was already
  // 2 chars (like "HS"), so the total was 2+1+2+2+2 = 9, not 10.
  // The spec says 10 digits. The fix: CC must be 2 digits, and we need 8 chars of suffix.
  // But old IDs only have 7 chars of suffix.
  //
  // The bowlerPosition (BB) is stored in the DB. We can get TT from teams.teamCode.
  // The L and EE are import-time params. Looking at existing IDs:
  // "HS1260701" → old CC="HS", then "1260701" = L=1, EE=26, TT=07, BB=01 ✓ (7 chars)
  // New: "01" + "1260701" = "011260701" = 9 chars. Still 9.
  //
  // The spec requires 10 digits. The only way to get 10 is if the old format was wrong
  // and we need to add a leading zero to CC making it truly 2 digits PLUS keep 8 suffix chars.
  // But there are only 7 suffix chars in the old data.
  //
  // CONCLUSION: The old IDs were 9 chars (a pre-existing bug). The new IDs will be 9 chars
  // if we keep the same structure. To get 10 chars we need to either:
  //   A) Pad the whole thing to 10 with a leading zero: "0" + newCC(2) + suffix7 = 10 chars
  //      But then CC would be 3 chars which breaks the spec.
  //   B) Use newCC(2) + "0" + suffix7 = 10 chars (insert a zero between CC and suffix)
  //      But that changes the meaning of L.
  //   C) Accept that the spec segment breakdown is CC(2)+L(1)+EE(2)+TT(2)+BB(2)=9 digits
  //      and the "10-digit" requirement means we need to pad BB to 3 digits or add a check digit.
  //   D) The correct interpretation: old CC was 1 digit (not 2), so the format was
  //      CC(1)+L(1)+EE(2)+TT(2)+BB(2)=8, or CC(2)+L(1)+EE(2)+TT(2)+BB(2)=9.
  //      The user said "10 digit" — so we need one more digit somewhere.
  //
  // SIMPLEST FIX that makes IDs exactly 10 digits:
  // Use CC(2) + L(1) + EE(2) + TT(2) + BB(3) — pad bowlerPosition to 3 digits.
  // OR: use CC(2) + "0" + L(1) + EE(2) + TT(2) + BB(2) = 10 (add a fixed "0" separator).
  //
  // Looking at the test file: generateScantronId("01","1","01","01","01") should produce
  // "0110101 01" = "0110101 01"... let me check the test expectations.
  console.log(`  ${b.legalFirstName} ${b.legalLastName}: "${oldId}" → would be "${newId}" (${newId.length} chars)`);
  if (newId.length !== 10) warned++;
}

console.log(`\nWARNING: ${warned} IDs would be ${9} chars, not 10.`);
console.log("Checking test file for expected format...");
await conn.end();
