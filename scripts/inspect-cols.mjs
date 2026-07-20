import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

for (const tbl of ["teams", "bowlers", "events"]) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME=? AND TABLE_SCHEMA=DATABASE()
     ORDER BY ORDINAL_POSITION`,
    [tbl]
  );
  console.log(`\n=== ${tbl} (${rows.length} cols) ===`);
  for (const r of rows) {
    console.log(`  ${r.COLUMN_NAME}  ${r.COLUMN_TYPE}  null=${r.IS_NULLABLE}  default=${r.COLUMN_DEFAULT}`);
  }
}
await conn.end();
