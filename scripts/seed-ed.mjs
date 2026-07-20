/**
 * Seed the default Event Director account.
 * Run once: node scripts/seed-ed.mjs
 */
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(DB_URL);

const username = "admin";
const password = "VegasSweeps2025!";
const hash = await bcrypt.hash(password, 12);

// Check if already exists
const [rows] = await conn.execute("SELECT id FROM app_users WHERE username = ?", [username]);
if (rows.length > 0) {
  console.log("✅ EventDirector account already exists — skipping.");
} else {
  await conn.execute(
    `INSERT INTO app_users (username, passwordHash, designation, appRole, active, eventId, createdAt)
     VALUES (?, ?, 'ED01', 'EventDirector', 1, 1, NOW())`,
    [username, hash]
  );
  console.log(`✅ Created EventDirector account: username=${username} password=${password}`);
}

await conn.end();
