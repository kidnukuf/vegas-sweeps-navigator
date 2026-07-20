import { createConnection } from "mysql2/promise";

const db = await createConnection(process.env.DATABASE_URL);

// Describe the events table
const [cols] = await db.execute("DESCRIBE events");
console.log("COLUMNS:", cols.map(r => r.Field).join(", "));

// List all events
const [rows] = await db.execute("SELECT * FROM events ORDER BY id LIMIT 20");
console.log("EVENTS:", JSON.stringify(rows, null, 2));

await db.end();
