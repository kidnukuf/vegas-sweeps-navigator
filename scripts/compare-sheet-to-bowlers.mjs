import fs from "node:fs";
import Papa from "papaparse";
import mysql from "mysql2/promise";

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error("Usage: node scripts/compare-sheet-to-bowlers.mjs <csv-path>");

const parsed = Papa.parse(fs.readFileSync(csvPath, "utf8"), {
  header: true,
  skipEmptyLines: true,
});

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const sheetBowlers = parsed.data
  .map((row, index) => ({
    row: index + 2,
    firstName: String(row["First Name"] ?? "").trim(),
    lastName: String(row["Last Name"] ?? "").trim(),
    center: String(row["Center"] ?? "").trim(),
    team: String(row["Team #"] ?? "").trim(),
  }))
  .filter((row) => {
    const name = `${row.firstName} ${row.lastName}`.trim().toLowerCase();
    return name && !["vacant", "tbd", "open"].includes(name) && !name.startsWith("vacant") && !name.startsWith("tbd");
  });

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const [bowlers] = await connection.query(
  "SELECT id, eventId, legalFirstName, legalLastName, scantronId, poolPartyToken, banquetToken FROM bowlers ORDER BY eventId, id"
);
await connection.end();

const bowlersByName = new Map();
for (const bowler of bowlers) {
  const key = `${normalize(bowler.legalFirstName)}|${normalize(bowler.legalLastName)}`;
  const existing = bowlersByName.get(key) ?? [];
  existing.push(bowler);
  bowlersByName.set(key, existing);
}

const missingFromApp = [];
const matchedWithoutData = [];
for (const row of sheetBowlers) {
  const matches = bowlersByName.get(`${normalize(row.firstName)}|${normalize(row.lastName)}`) ?? [];
  if (matches.length === 0) {
    missingFromApp.push(row);
    continue;
  }
  for (const bowler of matches) {
    if (!bowler.scantronId || !bowler.poolPartyToken || !bowler.banquetToken) {
      matchedWithoutData.push({ row, bowler });
    }
  }
}

console.log(JSON.stringify({
  sheetNonVacantCount: sheetBowlers.length,
  dbBowlerCount: bowlers.length,
  missingFromAppCount: missingFromApp.length,
  missingFromApp,
  matchedWithoutDataCount: matchedWithoutData.length,
  matchedWithoutData,
}, null, 2));
