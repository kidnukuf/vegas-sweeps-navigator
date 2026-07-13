/**
 * offlineDoorDb — IndexedDB layer for the single-laptop offline door scanner.
 *
 * Everything the door needs to validate guests with ZERO internet lives here:
 *   - guests:      every valid token for the loaded event + mode, with used status
 *   - scanLog:     every scan attempt (admit/deny/override/reentry), source of truth
 *   - reentryPool: the 200 reusable directional reentry codes (N/E/S/W × 50)
 *   - meta:        load metadata + the hashed override PIN
 *
 * Writes happen synchronously on every scan so a crash/reload never loses data.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type DoorMode = "banquet" | "pool";
export type ReentryZone = "N" | "E" | "S" | "W";

export type ScanResult =
  | "admitted"
  | "denied_used"
  | "denied_notfound"
  | "override_admitted"
  | "reentry_admitted"
  | "denied_wrongzone";

export interface GuestRecord {
  token: string;
  displayName: string;
  teamNumber: string | null;
  teamName: string | null;
  entitlementType: "bowler" | "guest";
  guestSuffix: string | null;
  mode: DoorMode;
  eventId: number;
  alreadyUsedAtLoad: boolean;
  /** Set true once consumed during THIS session (offline). */
  usedThisSession: boolean;
}

export interface ScanLogRecord {
  id?: number;
  token: string;
  result: ScanResult;
  reason: string | null;
  lane: number | null;
  mode: DoorMode;
  eventId: number;
  scannedAtMs: number;
  overrideBy: string | null;
  wristbandNumber: string | null;
  edFlagged: boolean;
  syncedAt: number | null;
}

export interface ReentryPoolRecord {
  token: string;
  zone: ReentryZone;
  mode: DoorMode;
  eventId: number;
  inUse: boolean;
  linkedWristband: string | null;
  issuedAtMs: number | null;
  /** Pending sync action not yet uploaded: 'issue' | 'release' | null */
  pendingAction: "issue" | "release" | null;
  pendingAtMs: number | null;
}

export interface MetaRecord {
  key: string;
  eventId: number;
  mode: DoorMode;
  eventName: string;
  loadedAtMs: number;
  pinHash: string | null;
  deviceId: string;
}

export interface SheetCacheRecord {
  /** Unique key: token (matches guest token) */
  token: string;
  /** Orange column letter (e.g., 'AB', 'AD', 'AF', 'X') */
  orangeColumn: string;
  /** Purple column letter (e.g., 'AC', 'AE', 'AG', 'Y') */
  purpleColumn: string;
  /** Whether an 'X' has been written to the purple column locally */
  purpleMarked: boolean;
  /** Timestamp when purple mark was written locally */
  purpleMarkedAtMs: number | null;
  /** Pending sync action: 'mark' | null */
  pendingAction: "mark" | null;
  pendingAtMs: number | null;
}

interface DoorDB extends DBSchema {
  guests: { key: string; value: GuestRecord; indexes: { byName: string } };
  scanLog: { key: number; value: ScanLogRecord; indexes: { bySynced: number } };
  reentryPool: { key: string; value: ReentryPoolRecord; indexes: { byZone: string } };
  sheetCache: { key: string; value: SheetCacheRecord };
  meta: { key: string; value: MetaRecord };
}

const DB_NAME = "vsn-offline-door";
const DB_VERSION = 1;

let _dbPromise: Promise<IDBPDatabase<DoorDB>> | null = null;

export function getDoorDB(): Promise<IDBPDatabase<DoorDB>> {
  if (!_dbPromise) {
    _dbPromise = openDB<DoorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("guests")) {
          const s = db.createObjectStore("guests", { keyPath: "token" });
          s.createIndex("byName", "displayName");
        }
        if (!db.objectStoreNames.contains("scanLog")) {
          const s = db.createObjectStore("scanLog", { keyPath: "id", autoIncrement: true });
          // syncedAt stored as number; unsynced rows use 0 so they are indexable.
          s.createIndex("bySynced", "syncedAt");
        }
        if (!db.objectStoreNames.contains("reentryPool")) {
          const s = db.createObjectStore("reentryPool", { keyPath: "token" });
          s.createIndex("byZone", "zone");
        }
        if (!db.objectStoreNames.contains("sheetCache")) {
          db.createObjectStore("sheetCache", { keyPath: "token" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return _dbPromise;
}

// ─── PIN hashing (SHA-256 via WebCrypto; offline-capable) ─────────────────────
export async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPin(pin: string): Promise<boolean> {
  const meta = await getMeta();
  if (!meta?.pinHash) return false;
  return (await hashPin(pin)) === meta.pinHash;
}

export async function setPin(pin: string): Promise<void> {
  const db = await getDoorDB();
  const meta = await getMeta();
  if (!meta) return;
  meta.pinHash = await hashPin(pin);
  await db.put("meta", meta);
}

// ─── Load a fresh dataset (replaces any previous load) ────────────────────────
export interface LoadPayload {
  eventId: number;
  mode: DoorMode;
  eventName: string;
  loadedAtMs: number;
  guests: Array<{
    token: string;
    displayName: string;
    teamNumber: string | null;
    teamName: string | null;
    entitlementType: "bowler" | "guest";
    guestSuffix: string | null;
    alreadyUsedAtLoad: boolean;
    orangeColumn?: string;
    purpleColumn?: string;
  }>;
  reentry: Array<{
    token: string;
    zone: string;
    inUse: boolean;
    linkedWristband: string | null;
  }>;
}

function randomDeviceId(): string {
  return "dev-" + Math.random().toString(36).slice(2, 10);
}

export async function loadDataset(payload: LoadPayload): Promise<void> {
  const db = await getDoorDB();

  // Preserve an existing deviceId + pin if reloading the same event/mode.
  const prevMeta = await getMeta();
  const deviceId = prevMeta?.deviceId ?? randomDeviceId();
  const keepPin =
    prevMeta && prevMeta.eventId === payload.eventId && prevMeta.mode === payload.mode
      ? prevMeta.pinHash
      : null;

  // Clear guests + reentryPool + sheetCache (full replace). Keep scanLog (unsynced scans must survive).
  await db.clear("guests");
  await db.clear("reentryPool");
  await db.clear("sheetCache");

  // Initialize sheet cache from guest data (orange/purple column info).
  await initSheetCache(payload.guests);

  const gtx = db.transaction("guests", "readwrite");
  for (const g of payload.guests) {
    await gtx.store.put({
      ...g,
      mode: payload.mode,
      eventId: payload.eventId,
      usedThisSession: false,
    });
  }
  await gtx.done;

  const rtx = db.transaction("reentryPool", "readwrite");
  for (const r of payload.reentry) {
    await rtx.store.put({
      token: r.token,
      zone: r.zone as ReentryZone,
      mode: payload.mode,
      eventId: payload.eventId,
      inUse: r.inUse,
      linkedWristband: r.linkedWristband,
      issuedAtMs: null,
      pendingAction: null,
      pendingAtMs: null,
    });
  }
  await rtx.done;

  await db.put("meta", {
    key: "current",
    eventId: payload.eventId,
    mode: payload.mode,
    eventName: payload.eventName,
    loadedAtMs: payload.loadedAtMs,
    pinHash: keepPin,
    deviceId,
  });
}

export async function getMeta(): Promise<MetaRecord | undefined> {
  const db = await getDoorDB();
  return db.get("meta", "current");
}

export async function getGuest(token: string): Promise<GuestRecord | undefined> {
  const db = await getDoorDB();
  return db.get("guests", token);
}

export async function getAllGuests(): Promise<GuestRecord[]> {
  const db = await getDoorDB();
  return db.getAll("guests");
}

export async function searchGuests(query: string, limit = 25): Promise<GuestRecord[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await getAllGuests();
  return all
    .filter(
      (g) =>
        g.displayName.toLowerCase().includes(q) ||
        (g.teamNumber ?? "").toLowerCase().includes(q) ||
        (g.teamName ?? "").toLowerCase().includes(q)
    )
    .slice(0, limit);
}

export async function markGuestUsed(token: string): Promise<void> {
  const db = await getDoorDB();
  const g = await db.get("guests", token);
  if (!g) return;
  g.usedThisSession = true;
  await db.put("guests", g);
}

export async function appendScanLog(rec: Omit<ScanLogRecord, "id">): Promise<number> {
  const db = await getDoorDB();
  return (await db.add("scanLog", rec as ScanLogRecord)) as number;
}

export async function getUnsyncedScans(): Promise<ScanLogRecord[]> {
  const db = await getDoorDB();
  const all = await db.getAll("scanLog");
  return all.filter((s) => !s.syncedAt);
}

export async function markScansSynced(ids: number[]): Promise<void> {
  const db = await getDoorDB();
  const now = Date.now();
  const tx = db.transaction("scanLog", "readwrite");
  for (const id of ids) {
    const rec = await tx.store.get(id);
    if (rec) {
      rec.syncedAt = now;
      await tx.store.put(rec);
    }
  }
  await tx.done;
}

export async function getReentryByToken(token: string): Promise<ReentryPoolRecord | undefined> {
  const db = await getDoorDB();
  return db.get("reentryPool", token);
}

export async function getReentryByZone(zone: ReentryZone): Promise<ReentryPoolRecord[]> {
  const db = await getDoorDB();
  return db.getAllFromIndex("reentryPool", "byZone", zone);
}

export async function getAllReentry(): Promise<ReentryPoolRecord[]> {
  const db = await getDoorDB();
  return db.getAll("reentryPool");
}

/** Find the next available reentry code in a zone. */
export async function nextAvailableReentry(zone: ReentryZone): Promise<ReentryPoolRecord | undefined> {
  const codes = await getReentryByZone(zone);
  return codes.find((c) => !c.inUse);
}

export async function issueReentryLocal(token: string, wristbandNumber: string): Promise<void> {
  const db = await getDoorDB();
  const rec = await db.get("reentryPool", token);
  if (!rec) return;
  rec.inUse = true;
  rec.linkedWristband = wristbandNumber;
  rec.issuedAtMs = Date.now();
  rec.pendingAction = "issue";
  rec.pendingAtMs = rec.issuedAtMs;
  await db.put("reentryPool", rec);
}

export async function releaseReentryLocal(token: string): Promise<void> {
  const db = await getDoorDB();
  const rec = await db.get("reentryPool", token);
  if (!rec) return;
  rec.inUse = false;
  rec.linkedWristband = null;
  rec.pendingAction = "release";
  rec.pendingAtMs = Date.now();
  await db.put("reentryPool", rec);
}

export async function getPendingReentryEvents(): Promise<
  Array<{ token: string; action: "issue" | "release"; wristbandNumber: string | null; atMs: number }>
> {
  const all = await getAllReentry();
  return all
    .filter((r) => r.pendingAction !== null)
    .map((r) => ({
      token: r.token,
      action: r.pendingAction as "issue" | "release",
      wristbandNumber: r.linkedWristband,
      atMs: r.pendingAtMs ?? Date.now(),
    }));
}

export async function clearPendingReentry(tokens: string[]): Promise<void> {
  const db = await getDoorDB();
  const tx = db.transaction("reentryPool", "readwrite");
  for (const token of tokens) {
    const rec = await tx.store.get(token);
    if (rec) {
      rec.pendingAction = null;
      rec.pendingAtMs = null;
      await tx.store.put(rec);
    }
  }
  await tx.done;
}

/** Live counts for the Console dashboard (from local scanLog). */
export async function getLocalCounts(): Promise<Record<ScanResult, number>> {
  const db = await getDoorDB();
  const all = await db.getAll("scanLog");
  const counts: Record<ScanResult, number> = {
    admitted: 0,
    denied_used: 0,
    denied_notfound: 0,
    override_admitted: 0,
    reentry_admitted: 0,
    denied_wrongzone: 0,
  };
  for (const s of all) counts[s.result] = (counts[s.result] ?? 0) + 1;
  return counts;
}

export async function getUnsyncedCount(): Promise<number> {
  return (await getUnsyncedScans()).length;
}

// ─── Sheet Cache (orange/purple column tracking for offline QR marking) ──────
/**
 * Initialize sheet cache from preloaded guest data.
 * Called during loadDataset to populate sheetCache with orange/purple column info.
 */
export async function initSheetCache(
  guests: Array<{
    token: string;
    orangeColumn?: string;
    purpleColumn?: string;
  }>
): Promise<void> {
  const db = await getDoorDB();
  await db.clear("sheetCache");

  const tx = db.transaction("sheetCache", "readwrite");
  for (const g of guests) {
    if (g.orangeColumn && g.purpleColumn) {
      await tx.store.put({
        token: g.token,
        orangeColumn: g.orangeColumn,
        purpleColumn: g.purpleColumn,
        purpleMarked: false,
        purpleMarkedAtMs: null,
        pendingAction: null,
        pendingAtMs: null,
      });
    }
  }
  await tx.done;
}

/**
 * Get sheet cache entry for a token.
 * Returns orange/purple column info and current purple-mark status.
 */
export async function getSheetCache(token: string): Promise<SheetCacheRecord | undefined> {
  const db = await getDoorDB();
  return db.get("sheetCache", token);
}

/**
 * Mark purple column as used (write "X" locally).
 * Called immediately after a successful scan admission.
 */
export async function markPurpleColumn(token: string): Promise<void> {
  const db = await getDoorDB();
  const rec = await db.get("sheetCache", token);
  if (rec) {
    rec.purpleMarked = true;
    rec.purpleMarkedAtMs = Date.now();
    rec.pendingAction = "mark";
    rec.pendingAtMs = Date.now();
    await db.put("sheetCache", rec);
  }
}

/**
 * Get all pending purple-column marks (not yet synced to Google Sheets).
 * Used by sync service to upload local marks.
 */
export async function getPendingPurpleMarks(): Promise<SheetCacheRecord[]> {
  const db = await getDoorDB();
  const all = await db.getAll("sheetCache");
  return all.filter((r) => r.pendingAction === "mark");
}

/**
 * Clear pending action for a token after successful sync.
 */
export async function clearPendingPurpleMark(token: string): Promise<void> {
  const db = await getDoorDB();
  const rec = await db.get("sheetCache", token);
  if (rec) {
    rec.pendingAction = null;
    rec.pendingAtMs = null;
    await db.put("sheetCache", rec);
  }
}
