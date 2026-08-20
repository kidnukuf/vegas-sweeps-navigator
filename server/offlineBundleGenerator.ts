/**
 * offlineBundleGenerator.ts
 *
 * Generates a single self-contained .html file that contains:
 *   - All valid tokens (banquet OR pool) embedded as a JSON blob
 *   - All reentry codes embedded
 *   - Full dual-lane scanner UI (Scanner A + Scanner B)
 *   - In-memory + localStorage race-condition guard (same-token double-scan protection)
 *   - Instant token disable on scan (shared across both lanes via localStorage events)
 *   - Scan log stored in localStorage for later sync
 *   - Zero external dependencies — works 100% offline
 *
 * Usage: call generateOfflineBundle(eventId, mode) → returns HTML string
 */

import { loadDoorGuests, ensureReentryPool, getEventById, type DoorMode } from "./db";
import { OFFLINE_SCAN_FEEDBACK } from "./offlineScannerFeedback";

function makeReentryToken(eventId: number, mode: DoorMode, zone: string, index: number): string {
  const m = mode === "banquet" ? "BQ" : "PP";
  return `RE-${m}-${zone}-${eventId}-${String(index).padStart(3, "0")}`;
}

export async function generateOfflineBundle(
  eventId: number,
  mode: DoorMode
): Promise<string> {
  const guests = await loadDoorGuests(eventId, mode);
  const reentry = await ensureReentryPool(eventId, mode, makeReentryToken);
  const event = (await getEventById(eventId)) as Record<string, unknown> | null;
  const eventName = (event?.eventName as string) ?? "Event";
  const modeLabel = mode === "banquet" ? "Banquet" : "Pool Party";
  const generatedAt = new Date().toISOString();

  // Build the token lookup map: token → guest record
  const tokenMap: Record<string, {
    displayName: string;
    teamNumber: string | null;
    teamName: string | null;
    entitlementType: string;
    alreadyUsedAtLoad: boolean;
    under21: boolean;
  }> = {};
  for (const g of guests) {
    tokenMap[g.token] = {
      displayName: g.displayName,
      teamNumber: g.teamNumber,
      teamName: g.teamName,
      entitlementType: g.entitlementType,
      alreadyUsedAtLoad: g.alreadyUsedAtLoad,
      under21: g.under21,
    };
  }

  // Build the reentry map: token → { zone, inUse }
  const reentryMap: Record<string, { zone: string; inUse: boolean; linkedWristband: string | null }> = {};
  for (const r of reentry) {
    reentryMap[r.token] = {
      zone: r.zone,
      inUse: Boolean(r.inUse),
      linkedWristband: r.linkedWristband ?? null,
    };
  }

  const storageKey = `vsn_offline_used_${eventId}_${mode}`;
  const scanLogKey = `vsn_offline_scanlog_${eventId}_${mode}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(eventName)} — ${escHtml(modeLabel)} Scanner (Offline)</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f172a;
    --card: #1e293b;
    --border: #334155;
    --text: #f1f5f9;
    --muted: #94a3b8;
    --green: #22c55e;
    --green-bg: #14532d;
    --red: #ef4444;
    --red-bg: #7f1d1d;
    --amber: #f59e0b;
    --amber-bg: #78350f;
    --blue: #3b82f6;
    --blue-bg: #1e3a5f;
    --cyan: #22d3ee;
    --cyan-bg: #164e63;
    --radius: 12px;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; }
  body { display: flex; flex-direction: column; }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; background: var(--card); border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .header-title { font-size: 1rem; font-weight: 700; }
  .header-meta { font-size: 0.75rem; color: var(--muted); }
  .header-badge {
    padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
    background: var(--amber-bg); color: var(--amber);
  }
  .header-badge.online { background: #14532d; color: var(--green); }

  /* ── Stats bar ── */
  .stats-bar {
    display: flex; gap: 12px; padding: 8px 16px;
    background: #0d1829; border-bottom: 1px solid var(--border);
    flex-shrink: 0; flex-wrap: wrap;
  }
  .stat { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
  .stat-val { font-size: 1.4rem; font-weight: 800; line-height: 1; }
  .stat-lbl { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  .stat-val.green { color: var(--green); }
  .stat-val.red { color: var(--red); }
  .stat-val.amber { color: var(--amber); }

  /* ── Lanes ── */
  .lanes { display: flex; flex: 1; gap: 8px; padding: 8px; overflow: hidden; }
  .lane {
    flex: 1; display: flex; flex-direction: column; border-radius: var(--radius);
    border: 3px solid var(--border); background: var(--card);
    transition: border-color .15s, background .15s; overflow: hidden; position: relative;
  }
  .lane.admit { border-color: var(--green); background: var(--green-bg); }
  .lane.under21 { border-color: var(--cyan); background: var(--cyan-bg); }
  .lane.deny  { border-color: var(--red);   background: var(--red-bg); }
  .lane.used  { border-color: var(--red); background: var(--red-bg); }
  .lane.notfound { border-color: #6b21a8; background: #3b0764; }

  .lane-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .lane-label { font-size: 1rem; font-weight: 700; }
  .lane-count { font-size: 0.75rem; color: var(--muted); }

  .lane-body {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 16px; text-align: center; gap: 12px;
  }
  .lane-headline { font-size: 3.5rem; font-weight: 900; line-height: 1; text-transform: uppercase; letter-spacing: -.02em; }
  .lane-detail   { font-size: 1.3rem; font-weight: 500; color: rgba(255,255,255,.9); }
  .lane-team     { font-size: 0.9rem; color: rgba(255,255,255,.6); }
  .lane-idle     { font-size: 1.4rem; color: var(--muted); }

  .lane-input-row { padding: 10px 14px; border-top: 1px solid rgba(255,255,255,.08); }
  .lane-input {
    width: 100%; padding: 8px 12px; border-radius: 8px;
    border: 1px solid var(--border); background: rgba(0,0,0,.3);
    color: var(--text); font-size: 0.9rem; outline: none;
  }
  .lane-input:focus { border-color: var(--blue); }

  /* ── Log panel ── */
  .log-panel {
    height: 160px; flex-shrink: 0; border-top: 1px solid var(--border);
    background: #080f1c; overflow-y: auto; padding: 6px 10px;
    font-family: monospace; font-size: 0.72rem;
  }
  .log-entry { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
  .log-entry.admit { color: var(--green); }
  .log-entry.under21 { color: var(--cyan); }
  .log-entry.deny  { color: var(--red); }
  .log-entry.used  { color: var(--amber); }
  .log-entry.notfound { color: #a855f7; }

  /* ── Toolbar ── */
  .toolbar {
    display: flex; align-items: center; gap: 8px; padding: 8px 16px;
    background: var(--card); border-top: 1px solid var(--border); flex-shrink: 0;
    flex-wrap: wrap;
  }
  .btn {
    padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border);
    background: transparent; color: var(--text); font-size: 0.8rem; font-weight: 600;
    cursor: pointer; transition: background .12s;
  }
  .btn:hover { background: rgba(255,255,255,.08); }
  .btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
  .btn.danger  { background: var(--red-bg); border-color: var(--red); color: var(--red); }
  .toolbar-spacer { flex: 1; }
  .toolbar-info { font-size: 0.72rem; color: var(--muted); }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.7);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal-overlay.hidden { display: none; }
  .modal {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 24px; max-width: 480px; width: 90%; max-height: 80vh; overflow-y: auto;
  }
  .modal h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; }
  .modal p  { font-size: 0.85rem; color: var(--muted); margin-bottom: 16px; line-height: 1.6; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

  /* ── Search ── */
  .search-box {
    width: 100%; padding: 8px 12px; border-radius: 8px;
    border: 1px solid var(--border); background: rgba(0,0,0,.3);
    color: var(--text); font-size: 0.9rem; outline: none; margin-bottom: 12px;
  }
  .search-result {
    padding: 8px 10px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--border); margin-bottom: 6px; background: rgba(255,255,255,.03);
  }
  .search-result:hover { background: rgba(255,255,255,.07); }
  .search-result .name { font-weight: 600; font-size: 0.9rem; }
  .search-result .meta { font-size: 0.75rem; color: var(--muted); }
  .search-result.used-row .name { text-decoration: line-through; color: var(--muted); }
  .search-result.used-row .meta { color: var(--red); }

  @keyframes flash-in { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:scale(1); } }
  .flash-in { animation: flash-in .15s ease-out; }

  /* Full-screen outcome feedback: green = 21+, cyan = accepted under 21, red = no entry. */
  #screenFlash { position:fixed; inset:0; z-index:500; display:none; align-items:center; justify-content:center; pointer-events:none; }
  #screenFlash.show { display:flex; animation: screen-flash .8s ease-out; }
  #screenFlash.adult { background:rgba(34,197,94,.44); color:var(--green); }
  #screenFlash.under21 { background:rgba(34,211,238,.48); color:var(--cyan); }
  #screenFlash.denied { background:rgba(239,68,68,.52); color:var(--red); }
  #screenFlash .flash-card { border:4px solid currentColor; border-radius:24px; background:rgba(8,15,28,.94); padding:28px 42px; max-width:82vw; text-align:center; box-shadow:0 0 90px currentColor; }
  #screenFlash .flash-label { font-size:clamp(2.5rem,8vw,6.5rem); font-weight:900; letter-spacing:.03em; line-height:1; }
  #screenFlash .flash-name { margin-top:12px; font-size:clamp(1.1rem,3vw,2rem); font-weight:700; color:#fff; }
  #screenFlash .flash-detail { margin-top:7px; font-size:1rem; color:#cbd5e1; }
  @keyframes screen-flash { 0% { opacity:0; } 12%, 65% { opacity:1; } 100% { opacity:0; } }
  @media (prefers-reduced-motion: reduce) { #screenFlash.show { animation:none; } }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="header-title">🎳 ${escHtml(eventName)} — ${escHtml(modeLabel)} Scanner</div>
    <div class="header-meta">Generated ${generatedAt} · ${guests.length} passes · ${reentry.length} re-entry codes</div>
  </div>
  <div class="header-badge" id="offlineBadge">● OFFLINE MODE</div>
</div>

<!-- Stats bar -->
<div class="stats-bar">
  <div class="stat"><div class="stat-val green" id="statAdmit">0</div><div class="stat-lbl">Admitted</div></div>
  <div class="stat"><div class="stat-val amber" id="statUsed">0</div><div class="stat-lbl">Already In</div></div>
  <div class="stat"><div class="stat-val red" id="statDeny">0</div><div class="stat-lbl">Not Found</div></div>
  <div class="stat"><div class="stat-val" id="statTotal" style="color:var(--text)">${guests.length}</div><div class="stat-lbl">Total Passes</div></div>
  <div class="stat"><div class="stat-val" id="statRemaining" style="color:var(--blue)">${guests.filter(g => !g.alreadyUsedAtLoad).length}</div><div class="stat-lbl">Remaining</div></div>
</div>

<!-- Lanes -->
<div class="lanes">
  <div class="lane" id="laneA">
    <div class="lane-header">
      <span class="lane-label">📡 Scanner A</span>
      <span class="lane-count" id="laneACount">0 scanned</span>
    </div>
    <div class="lane-body" id="laneABody">
      <div class="lane-idle">Ready to Scan</div>
      <div style="font-size:.85rem;color:var(--muted)">Scanner A — keyboard focus active</div>
    </div>
    <div class="lane-input-row">
      <input class="lane-input" id="laneAInput" placeholder="Manual entry or scanner input…" autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
  </div>
  <div class="lane" id="laneB">
    <div class="lane-header">
      <span class="lane-label">📡 Scanner B</span>
      <span class="lane-count" id="laneBCount">0 scanned</span>
    </div>
    <div class="lane-body" id="laneBBody">
      <div class="lane-idle">Ready to Scan</div>
      <div style="font-size:.85rem;color:var(--muted)">Scanner B — click input to focus</div>
    </div>
  <div class="lane-input-row">
      <input class="lane-input" id="laneBInput" placeholder="Manual entry or scanner input…" autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
  </div>
</div>

<!-- Full-screen color-coded scan outcome feedback -->
<div id="screenFlash" aria-live="assertive" aria-atomic="true"><div class="flash-card"><div class="flash-label"></div><div class="flash-name"></div><div class="flash-detail"></div></div></div>

<!-- Log panel -->
<div class="log-panel" id="logPanel">
  <div class="log-entry" style="color:var(--muted)">— scan log —</div>
</div>

<!-- Toolbar -->
<div class="toolbar">
  <button class="btn" onclick="openSearch()">🔍 Lookup Guest</button>
  <button class="btn" onclick="openSyncLog()">📋 Scan Log (${escHtml(scanLogKey)})</button>
  <button class="btn danger" onclick="confirmReset()">🗑 Reset Session</button>
  <div class="toolbar-spacer"></div>
  <div class="toolbar-info" id="toolbarInfo">Mode: ${escHtml(modeLabel)} · Event ID: ${eventId}</div>
</div>

<!-- Search Modal -->
<div class="modal-overlay hidden" id="searchModal">
  <div class="modal">
    <h2>🔍 Guest Lookup</h2>
    <input class="search-box" id="searchInput" placeholder="Type name or token…" oninput="doSearch(this.value)">
    <div id="searchResults"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeSearch()">Close</button>
    </div>
  </div>
</div>

<!-- Sync Log Modal -->
<div class="modal-overlay hidden" id="syncModal">
  <div class="modal">
    <h2>📋 Scan Log</h2>
    <p>Copy this JSON and paste it into the ED portal sync screen when you are back online to write results to the database and Google Sheet.</p>
    <textarea id="syncText" style="width:100%;height:200px;background:#0d1829;color:#94a3b8;border:1px solid var(--border);border-radius:8px;padding:8px;font-family:monospace;font-size:.72rem;resize:vertical;" readonly></textarea>
    <div class="modal-actions" style="margin-top:12px">
      <button class="btn primary" onclick="copySyncLog()">Copy to Clipboard</button>
      <button class="btn" onclick="downloadSyncLog()">Download JSON</button>
      <button class="btn" onclick="closeSyncLog()">Close</button>
    </div>
  </div>
</div>

<!-- Reset Confirm Modal -->
<div class="modal-overlay hidden" id="resetModal">
  <div class="modal">
    <h2>⚠️ Reset Session?</h2>
    <p>This clears all scans recorded in this browser session. The scan log will be lost if you have not downloaded it. This does NOT affect the server database.</p>
    <div class="modal-actions">
      <button class="btn danger" onclick="doReset()">Yes, Reset</button>
      <button class="btn" onclick="closeReset()">Cancel</button>
    </div>
  </div>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════════════
// EMBEDDED DATA (generated server-side, read-only)
// ═══════════════════════════════════════════════════════════════════════════
const TOKEN_MAP   = ${JSON.stringify(tokenMap)};
const REENTRY_MAP = ${JSON.stringify(reentryMap)};
const EVENT_ID    = ${eventId};
const MODE        = ${JSON.stringify(mode)};
const EVENT_NAME  = ${JSON.stringify(eventName)};
const STORAGE_KEY = ${JSON.stringify(storageKey)};
const SCAN_LOG_KEY = ${JSON.stringify(scanLogKey)};
const FEEDBACK = ${JSON.stringify(OFFLINE_SCAN_FEEDBACK)};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
// In-memory race-condition guard: tokens currently being processed.
// Prevents two scanners submitting the same token in the same JS tick.
const inFlight = new Set();

// Used tokens: loaded from localStorage on startup, updated on each admit.
let usedTokens = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  usedTokens = new Set(Array.isArray(saved) ? saved : []);
} catch(e) { usedTokens = new Set(); }

// Scan log: persisted to localStorage after every scan.
let scanLog = [];
try {
  const saved = JSON.parse(localStorage.getItem(SCAN_LOG_KEY) || '[]');
  scanLog = Array.isArray(saved) ? saved : [];
} catch(e) { scanLog = []; }

// Per-lane scan counts
const laneCounts = { A: 0, B: 0 };

// Stats
let statAdmit = 0, statUsed = 0, statDeny = 0;
let statRemaining = Object.values(TOKEN_MAP).filter(g => !g.alreadyUsedAtLoad).length;

// Reentry pool (mutable copy)
const reentryPool = JSON.parse(JSON.stringify(REENTRY_MAP));

// ═══════════════════════════════════════════════════════════════════════════
// CORE SCAN LOGIC
// ═══════════════════════════════════════════════════════════════════════════
function persistUsed() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...usedTokens])); } catch(e) {}
}
function persistScanLog() {
  try { localStorage.setItem(SCAN_LOG_KEY, JSON.stringify(scanLog)); } catch(e) {}
}
function appendScanLog(entry) {
  scanLog.push(entry);
  persistScanLog();
}

async function processScan(rawToken, lane) {
  const token = rawToken.trim();
  if (!token) return null;

  // ── Race-condition guard ────────────────────────────────────────────────
  if (inFlight.has(token)) {
    return { result: 'denied_used', admit: false, headline: 'DENIED', detail: 'Scan already in progress', displayName: null, teamNumber: null };
  }
  inFlight.add(token);
  try {
    const now = Date.now();

    // ── 1. Reentry token? ─────────────────────────────────────────────────
    const re = reentryPool[token];
    if (re !== undefined) {
      if (!re.inUse) {
        appendScanLog({ token, result: 'denied_notfound', reason: 'Reentry code not issued', lane, mode: MODE, eventId: EVENT_ID, scannedAtMs: now });
        return { result: 'denied_notfound', admit: false, headline: 'NOT ACTIVE', detail: 'Re-entry code not issued', displayName: null, teamNumber: null };
      }
      appendScanLog({ token, result: 'reentry_admitted', reason: 're-entry ' + re.zone, lane, mode: MODE, eventId: EVENT_ID, scannedAtMs: now, wristbandNumber: re.linkedWristband });
      return { result: 'reentry_admitted', admit: true, headline: 'RE-ENTRY OK', detail: re.linkedWristband ? 'Band #' + re.linkedWristband + ' (' + re.zone + ')' : 'Zone ' + re.zone, displayName: null, teamNumber: null };
    }

    // ── 2. In guest list? ─────────────────────────────────────────────────
    const guest = TOKEN_MAP[token];
    if (!guest) {
      appendScanLog({ token, result: 'denied_notfound', reason: 'Token not in list', lane, mode: MODE, eventId: EVENT_ID, scannedAtMs: now });
      return { result: 'denied_notfound', admit: false, headline: 'NOT FOUND', detail: 'Not on the list — step aside', displayName: null, teamNumber: null };
    }

    // ── 3. Already used? ──────────────────────────────────────────────────
    if (guest.alreadyUsedAtLoad || usedTokens.has(token)) {
      appendScanLog({ token, result: 'denied_used', reason: 'Already redeemed', lane, mode: MODE, eventId: EVENT_ID, scannedAtMs: now });
      return { result: 'denied_used', admit: false, headline: 'ALREADY IN', detail: guest.displayName + ' — already scanned', displayName: guest.displayName, teamNumber: guest.teamNumber };
    }

    // ── 4. Admit + consume ────────────────────────────────────────────────
    usedTokens.add(token);
    persistUsed();
    appendScanLog({ token, result: 'admitted', reason: null, lane, mode: MODE, eventId: EVENT_ID, scannedAtMs: now });

    return {
      result: 'admitted', admit: true,
      headline: 'WELCOME',
      detail: guest.displayName + (guest.teamNumber ? ' · Team ' + guest.teamNumber : ''),
      displayName: guest.displayName,
      teamNumber: guest.teamNumber,
    };
  } finally {
    inFlight.delete(token);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const flashTimers = { A: null, B: null };
let screenFlashTimer = null;
let audioContext = null;

function feedbackKind(decision) {
  if (decision.result === 'admitted') return decision.under21 ? 'under21' : 'adult';
  if (decision.result === 'reentry_admitted') return 'adult';
  return 'denied';
}

function playTone(frequency, start, duration, type, gain) {
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + .015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function playFeedback(kind) {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext = audioContext || new AudioCtor();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    if (kind === 'adult') {
      playTone(880, now, .13, 'sine', .13);
      playTone(1175, now + .15, .18, 'sine', .13);
    } else if (kind === 'under21') {
      playTone(523, now, .12, 'triangle', .14);
      playTone(659, now + .14, .12, 'triangle', .14);
      playTone(784, now + .28, .18, 'triangle', .14);
    } else {
      playTone(180, now, .20, 'sawtooth', .17);
      playTone(145, now + .25, .28, 'sawtooth', .17);
    }
  } catch (e) { console.warn('Scanner audio unavailable', e); }
}

function flashScreen(kind, decision) {
  const el = document.getElementById('screenFlash');
  const config = FEEDBACK[kind];
  el.className = 'show ' + config.flashClass;
  el.querySelector('.flash-label').textContent = config.label;
  el.querySelector('.flash-name').textContent = decision.displayName || '';
  el.querySelector('.flash-detail').textContent = decision.detail || '';
  if (screenFlashTimer) clearTimeout(screenFlashTimer);
  screenFlashTimer = setTimeout(() => { el.className = ''; }, kind === 'denied' ? 1900 : 1500);
}

function updateStats() {
  document.getElementById('statAdmit').textContent = statAdmit;
  document.getElementById('statUsed').textContent = statUsed;
  document.getElementById('statDeny').textContent = statDeny;
  document.getElementById('statRemaining').textContent = Math.max(0, statRemaining - statAdmit);
}

function showResult(lane, decision) {
  const el = document.getElementById('lane' + lane);
  const body = document.getElementById('lane' + lane + 'Body');
  const countEl = document.getElementById('lane' + lane + 'Count');

  // Clear previous flash class
  el.classList.remove('admit', 'under21', 'deny', 'used', 'notfound');

  let cls = 'deny';
  const kind = feedbackKind(decision);
  if (kind === 'adult') cls = 'admit';
  else if (kind === 'under21') cls = 'under21';
  else if (decision.result === 'denied_used') cls = 'used';
  else if (decision.result === 'denied_notfound') cls = 'notfound';

  el.classList.add(cls);
  laneCounts[lane]++;
  countEl.textContent = laneCounts[lane] + ' scanned';

  body.innerHTML = \`
    <div class="lane-headline flash-in">\${escHtml(decision.headline)}</div>
    <div class="lane-detail">\${escHtml(decision.detail)}</div>
    \${decision.teamNumber ? '<div class="lane-team">Team ' + escHtml(decision.teamNumber) + '</div>' : ''}
  \`;

  // Update stats
  if (decision.result === 'admitted' || decision.result === 'reentry_admitted') { statAdmit++; }
  else if (decision.result === 'denied_used') { statUsed++; }
  else { statDeny++; }
  updateStats();
  playFeedback(kind);
  flashScreen(kind, decision);

  // Log entry
  const logEl = document.getElementById('logPanel');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + cls;
  const ts = new Date().toLocaleTimeString();
  entry.textContent = '[' + ts + '] Lane ' + lane + ' · ' + decision.result.toUpperCase() + ' · ' + (decision.displayName || decision.detail || decision.token || '');
  logEl.insertBefore(entry, logEl.firstChild);

  // Auto-clear after delay
  if (flashTimers[lane]) clearTimeout(flashTimers[lane]);
  const delay = decision.admit ? 2200 : 4000;
  flashTimers[lane] = setTimeout(() => {
    el.classList.remove('admit', 'under21', 'deny', 'used', 'notfound');
    body.innerHTML = '<div class="lane-idle">Ready to Scan</div><div style="font-size:.85rem;color:var(--muted)">Scanner ' + lane + '</div>';
  }, delay);
}

async function handleScan(rawToken, lane) {
  const decision = await processScan(rawToken, lane === 'A' ? 1 : 2);
  if (!decision) return;
  showResult(lane, decision);
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD CAPTURE (Scanner A = global keyboard; Scanner B = its input only)
// ═══════════════════════════════════════════════════════════════════════════
let bufA = '', lastKeyA = 0;
let bufB = '', lastKeyB = 0;

document.addEventListener('keydown', function(e) {
  // If focus is in Scanner B's input, let that input handle it
  if (document.activeElement === document.getElementById('laneBInput')) return;
  // If focus is in any other input/textarea, ignore
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  const now = Date.now();
  if (now - lastKeyA > 120) bufA = '';
  lastKeyA = now;

  if (e.key === 'Enter') {
    const code = bufA;
    bufA = '';
    if (code) handleScan(code, 'A');
    e.preventDefault();
    return;
  }
  if (e.key.length === 1) bufA += e.key;
});

// Scanner B uses its dedicated input
const laneBInput = document.getElementById('laneBInput');
laneBInput.addEventListener('keydown', function(e) {
  const now = Date.now();
  if (now - lastKeyB > 120) bufB = '';
  lastKeyB = now;

  if (e.key === 'Enter') {
    const code = laneBInput.value.trim() || bufB;
    bufB = '';
    laneBInput.value = '';
    if (code) handleScan(code, 'B');
    e.preventDefault();
    return;
  }
  if (e.key.length === 1) bufB += e.key;
});

// Scanner A input (manual fallback)
const laneAInput = document.getElementById('laneAInput');
laneAInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const code = laneAInput.value.trim();
    laneAInput.value = '';
    if (code) handleScan(code, 'A');
    e.preventDefault();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH / LOOKUP
// ═══════════════════════════════════════════════════════════════════════════
function openSearch() {
  document.getElementById('searchModal').classList.remove('hidden');
  document.getElementById('searchInput').focus();
}
function closeSearch() {
  document.getElementById('searchModal').classList.add('hidden');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
}
function doSearch(q) {
  const query = q.toLowerCase().trim();
  const container = document.getElementById('searchResults');
  if (!query) { container.innerHTML = ''; return; }
  const results = Object.entries(TOKEN_MAP)
    .filter(([token, g]) => g.displayName.toLowerCase().includes(query) || token.toLowerCase().includes(query))
    .slice(0, 20);
  if (!results.length) { container.innerHTML = '<div style="color:var(--muted);font-size:.85rem">No matches</div>'; return; }
  container.innerHTML = results.map(([token, g]) => {
    const isUsed = g.alreadyUsedAtLoad || usedTokens.has(token);
    return \`<div class="search-result \${isUsed ? 'used-row' : ''}" onclick="manualAdmit('\${escHtml(token)}')">
      <div class="name">\${escHtml(g.displayName)}\${isUsed ? ' ✓' : ''}</div>
      <div class="meta">\${g.teamNumber ? 'Team ' + escHtml(g.teamNumber) + ' · ' : ''}\${escHtml(token)}</div>
    </div>\`;
  }).join('');
}
function manualAdmit(token) {
  closeSearch();
  handleScan(token, 'A');
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC LOG
// ═══════════════════════════════════════════════════════════════════════════
function openSyncLog() {
  document.getElementById('syncText').value = JSON.stringify({ eventId: EVENT_ID, mode: MODE, generatedAt: ${JSON.stringify(generatedAt)}, scans: scanLog }, null, 2);
  document.getElementById('syncModal').classList.remove('hidden');
}
function closeSyncLog() { document.getElementById('syncModal').classList.add('hidden'); }
function copySyncLog() {
  navigator.clipboard.writeText(document.getElementById('syncText').value).then(() => alert('Copied to clipboard!')).catch(() => alert('Copy failed — select all and copy manually.'));
}
function downloadSyncLog() {
  const blob = new Blob([document.getElementById('syncText').value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vsn-scan-log-' + EVENT_ID + '-' + MODE + '-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESET
// ═══════════════════════════════════════════════════════════════════════════
function confirmReset() { document.getElementById('resetModal').classList.remove('hidden'); }
function closeReset()   { document.getElementById('resetModal').classList.add('hidden'); }
function doReset() {
  usedTokens = new Set(Object.entries(TOKEN_MAP).filter(([,g]) => g.alreadyUsedAtLoad).map(([t]) => t));
  scanLog = [];
  persistUsed();
  persistScanLog();
  statAdmit = 0; statUsed = 0; statDeny = 0;
  laneCounts.A = 0; laneCounts.B = 0;
  updateStats();
  document.getElementById('laneACount').textContent = '0 scanned';
  document.getElementById('laneBCount').textContent = '0 scanned';
  document.getElementById('logPanel').innerHTML = '<div class="log-entry" style="color:var(--muted)">— session reset —</div>';
  closeReset();
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
// Restore already-used tokens from localStorage into the stats
(function init() {
  let preUsed = 0;
  for (const [token, g] of Object.entries(TOKEN_MAP)) {
    if (g.alreadyUsedAtLoad) preUsed++;
    else if (usedTokens.has(token)) { statAdmit++; }
  }
  updateStats();
  document.getElementById('statRemaining').textContent = Math.max(0, Object.values(TOKEN_MAP).filter(g => !g.alreadyUsedAtLoad).length - statAdmit);
  if (scanLog.length > 0) {
    const logEl = document.getElementById('logPanel');
    const note = document.createElement('div');
    note.className = 'log-entry';
    note.style.color = 'var(--amber)';
    note.textContent = '— ' + scanLog.length + ' scans restored from previous session —';
    logEl.appendChild(note);
  }
})();
</script>
</body>
</html>`;

  return html;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
