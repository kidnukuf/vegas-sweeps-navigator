/**
 * B.O.B. Roll-off Passport — Offline Local Server
 * Runs on the Event Director's Windows laptop at the venue.
 * No internet required for QR scanning. Syncs back to cloud when online.
 *
 * Uses sql.js (pure JavaScript SQLite — no native compilation, works on Windows as-is)
 *
 * Usage: node server.js  (or double-click START.bat)
 * Doorman tablets connect to: http://<laptop-ip>:7777/doorman-tablet
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");

// ─── sql.js SQLite (pure JS, no native binaries) ─────────────────────────────
const initSqlJs = require("sql.js");
const DB_PATH = path.join(__dirname, "bob_offline.db");

let db = null;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS bowlers (
      id INTEGER PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      scantronId TEXT,
      bowlingToken TEXT,
      bowlingUsed INTEGER DEFAULT 0,
      poolPartyToken TEXT,
      poolPartyUsed INTEGER DEFAULT 0,
      banquetToken TEXT,
      banquetUsed INTEGER DEFAULT 0,
      banquetTable TEXT
    );
    CREATE TABLE IF NOT EXISTS guest_pool_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bowlerId INTEGER NOT NULL,
      suffix TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      used INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      passportType TEXT NOT NULL,
      bowlerId INTEGER,
      scannedAt INTEGER NOT NULL,
      deviceId TEXT,
      syncedToCloud INTEGER DEFAULT 0,
      syncedAt INTEGER,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  saveDB();
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Helper: run a query and return all rows as objects
function dbAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a query and return first row
function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

// Helper: run a mutation (INSERT/UPDATE/DELETE)
function dbRun(sql, params = []) {
  if (!db) return;
  db.run(sql, params);
  saveDB();
}

// ─── Config helpers ───────────────────────────────────────────────────────────
function getConfig(key) {
  const row = dbGet("SELECT value FROM config WHERE key=?", [key]);
  return row ? row.value : null;
}
function setConfig(key, value) {
  dbRun("INSERT OR REPLACE INTO config (key, value) VALUES (?,?)", [key, String(value)]);
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Serve doorman-tablet.html at /doorman-tablet
app.get("/doorman-tablet", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "doorman-tablet.html"));
});

// ─── API: Load snapshot from JSON ────────────────────────────────────────────
app.post("/api/load-snapshot", (req, res) => {
  const { snapshot } = req.body;
  if (!snapshot || !snapshot.bowlers) {
    return res.status(400).json({ error: "Invalid snapshot" });
  }

  dbRun("DELETE FROM bowlers");

  dbRun("DELETE FROM guest_pool_tokens");

  for (const b of snapshot.bowlers) {
    dbRun(
      `INSERT OR REPLACE INTO bowlers
        (id, firstName, lastName, scantronId, bowlingToken, bowlingUsed, poolPartyToken, poolPartyUsed, banquetToken, banquetUsed, banquetTable)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.id,
        b.legalFirstName || "",
        b.legalLastName || "",
        b.scantronId || null,
        b.bowlingToken || null,
        b.bowlingUsed ? 1 : 0,
        b.poolPartyToken || null,
        b.poolPartyUsed ? 1 : 0,
        b.banquetToken || null,
        b.banquetUsed ? 1 : 0,
        b.banquetTable || null,
      ]
    );
    // Load guest pool tokens
    if (Array.isArray(b.guestPoolTokens)) {
      for (const gt of b.guestPoolTokens) {
        dbRun(
          `INSERT OR IGNORE INTO guest_pool_tokens (bowlerId, suffix, token, used) VALUES (?,?,?,?)`,
          [b.id, gt.suffix, gt.token, gt.used ? 1 : 0]
        );
      }
    }
  }

  if (snapshot.tabletPin) setConfig("tabletPin", snapshot.tabletPin);
  if (snapshot.eventName) setConfig("eventName", snapshot.eventName);
  setConfig("exportedAt", String(snapshot.exportedAt || Date.now()));
  setConfig("eventId", String(snapshot.eventId || 1));

  res.json({
    success: true,
    loaded: snapshot.bowlers.length,
    eventName: snapshot.eventName,
  });
});

// ─── API: Verify PIN ──────────────────────────────────────────────────────────
app.post("/api/verify-pin", (req, res) => {
  const { pin } = req.body;
  const storedPin = getConfig("tabletPin");
  if (!storedPin) return res.json({ success: false, error: "No PIN configured. Load snapshot first." });
  if (String(pin) === String(storedPin)) return res.json({ success: true });
  return res.json({ success: false, error: "Incorrect PIN" });
});

// ─── API: Scan QR code ────────────────────────────────────────────────────────
app.post("/api/scan", (req, res) => {
  const { token, passportType, deviceId } = req.body;
  if (!token || !passportType) {
    return res.status(400).json({ success: false, error: "Missing token or passportType" });
  }

  let bowler = null;
  let alreadyUsed = false;

  if (passportType === "bowling") {
    bowler = dbGet("SELECT * FROM bowlers WHERE bowlingToken=?", [token]);
    if (!bowler) return res.json({ success: false, error: "Token not found" });
    if (bowler.bowlingUsed) { alreadyUsed = true; }
    else { dbRun("UPDATE bowlers SET bowlingUsed=1 WHERE id=?", [bowler.id]); }
  } else if (passportType === "pool") {
    bowler = dbGet("SELECT * FROM bowlers WHERE poolPartyToken=?", [token]);
    if (!bowler) return res.json({ success: false, error: "Token not found" });
    if (bowler.poolPartyUsed) { alreadyUsed = true; }
    else { dbRun("UPDATE bowlers SET poolPartyUsed=1 WHERE id=?", [bowler.id]); }
  } else if (passportType === "banquet") {
    bowler = dbGet("SELECT * FROM bowlers WHERE banquetToken=?", [token]);
    if (!bowler) return res.json({ success: false, error: "Token not found" });
    if (bowler.banquetUsed) { alreadyUsed = true; }
    else { dbRun("UPDATE bowlers SET banquetUsed=1 WHERE id=?", [bowler.id]); }
  } else if (passportType === "guest-pool") {
    bowler = dbGet(
      `SELECT b.*, g.id as guestTokenId, g.used as guestUsed, g.suffix
       FROM guest_pool_tokens g
       INNER JOIN bowlers b ON b.id = g.bowlerId
       WHERE g.token=?`,
      [token]
    );
    if (!bowler) return res.json({ success: false, error: "Guest pass not found" });
    if (bowler.guestUsed) { alreadyUsed = true; }
    else { dbRun("UPDATE guest_pool_tokens SET used=1 WHERE token=?", [token]); }
  } else {
    return res.status(400).json({ success: false, error: "Unknown passportType" });
  }

  if (alreadyUsed) {
    return res.json({
      success: false,
      alreadyUsed: true,
      error: "Already redeemed",
      bowlerName: `${bowler.firstName} ${bowler.lastName}`,
    });
  }

  // Queue redemption for cloud sync
  dbRun(
    "INSERT INTO redemptions (token, passportType, bowlerId, scannedAt, deviceId, syncedToCloud, createdAt) VALUES (?,?,?,?,?,0,?)",
    [token, passportType, bowler.id, Date.now(), deviceId || "tablet", Date.now()]
  );

  return res.json({
    success: true,
    bowlerName: `${bowler.firstName} ${bowler.lastName}`,
    scantronId: bowler.scantronId,
  });
});

// ─── API: Get status ──────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  const bowlerRow = dbGet("SELECT COUNT(*) as c FROM bowlers");
  const pendingRow = dbGet("SELECT COUNT(*) as c FROM redemptions WHERE syncedToCloud=0");
  const pin = getConfig("tabletPin");
  res.json({
    ready: (bowlerRow?.c || 0) > 0 && !!pin,
    bowlerCount: bowlerRow?.c || 0,
    pendingSyncCount: pendingRow?.c || 0,
    exportedAt: getConfig("exportedAt") ? Number(getConfig("exportedAt")) : null,
    eventName: getConfig("eventName"),
    hasPin: !!pin,
    pinLength: pin ? String(pin).length : 4,
  });
});

// ─── API: Get pending redemptions ─────────────────────────────────────────────
app.get("/api/pending-sync", (req, res) => {
  const rows = dbAll("SELECT * FROM redemptions WHERE syncedToCloud=0");
  res.json({ redemptions: rows });
});

// ─── API: Mark redemptions as synced ─────────────────────────────────────────
app.post("/api/mark-synced", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ success: true, updated: 0 });
  for (const id of ids) {
    dbRun("UPDATE redemptions SET syncedToCloud=1, syncedAt=? WHERE id=?", [Date.now(), id]);
  }
  res.json({ success: true, updated: ids.length });
});

// ─── Catch-all: serve index.html ─────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = 7777;

initDB().then(() => {
  const server = http.createServer(app);
  server.listen(PORT, "0.0.0.0", () => {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) ips.push(net.address);
      }
    }

    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║     B.O.B. Roll-off Passport — OFFLINE SERVER       ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Local:   http://localhost:${PORT}                    ║`);
    for (const ip of ips) {
      const padded = `http://${ip}:${PORT}`.padEnd(42);
      console.log(`║  Network: ${padded}  ║`);
    }
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log("║  DOORMAN TABLETS: open the Network URL above        ║");
    console.log("║  Navigate to /doorman-tablet on each tablet         ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");

    const bowlerRow = dbGet("SELECT COUNT(*) as c FROM bowlers");
    const count = bowlerRow?.c || 0;
    if (count === 0) {
      console.log("⚠️  No bowler data loaded yet.");
      console.log("   Open http://localhost:7777 in a browser and load the snapshot.\n");
    } else {
      console.log(`✅ ${count} bowlers loaded. Ready to scan.\n`);
    }
  });

  // Auto-sync every 30 seconds when internet is available
  setInterval(attemptCloudSync, 30000);
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

// ─── Auto-sync to cloud ───────────────────────────────────────────────────────
const CLOUD_URL = "https://bobrolloffpassport.com";
let syncInProgress = false;

async function attemptCloudSync() {
  if (syncInProgress || !db) return;
  const pending = dbAll("SELECT * FROM redemptions WHERE syncedToCloud=0");
  if (pending.length === 0) return;

  syncInProgress = true;
  try {
    const response = await fetch(`${CLOUD_URL}/api/trpc/offline.syncRedemptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: {
          deviceId: os.hostname(),
          redemptions: pending.map((r) => ({
            token: r.token,
            passportType: r.passportType,
            bowlerId: r.bowlerId || undefined,
            scannedAt: r.scannedAt,
          })),
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.result?.data?.json?.success) {
        for (const r of pending) {
          dbRun("UPDATE redemptions SET syncedToCloud=1, syncedAt=? WHERE id=?", [Date.now(), r.id]);
        }
        console.log(`✅ Auto-synced ${pending.length} redemptions to cloud.`);
      }
    }
  } catch {
    // Offline — will retry in 30 seconds
  } finally {
    syncInProgress = false;
  }
}
