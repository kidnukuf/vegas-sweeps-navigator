/**
 * offlineDoorSync — connectivity detection + idempotent auto-sync.
 *
 * Watches online/offline status (browser events + a lightweight server ping) and,
 * whenever the device is online, flushes all unsynced scans + pending reentry events
 * to the server. The server dedupes on (token, scannedAtMs), so re-sending is safe.
 *
 * Uses a standalone vanilla tRPC client so it can run outside React (timers, events).
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import {
  getUnsyncedScans,
  markScansSynced,
  getPendingReentryEvents,
  clearPendingReentry,
  getMeta,
} from "./offlineDoorDb";

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
      },
    }),
  ],
});

export type ConnStatus = "online" | "offline" | "syncing";

type Listener = (s: { status: ConnStatus; unsynced: number; lastSyncAt: number | null }) => void;

let listeners: Listener[] = [];
let currentStatus: ConnStatus = navigator.onLine ? "online" : "offline";
let lastSyncAt: number | null = null;
let unsyncedCount = 0;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

function emit() {
  for (const l of listeners) l({ status: currentStatus, unsynced: unsyncedCount, lastSyncAt });
}

export function subscribeConn(l: Listener): () => void {
  listeners.push(l);
  l({ status: currentStatus, unsynced: unsyncedCount, lastSyncAt });
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

async function refreshUnsyncedCount() {
  unsyncedCount = (await getUnsyncedScans()).length;
}

/** Probe the server. Returns true if reachable. */
async function ping(): Promise<boolean> {
  try {
    const res = await client.offlineDoor.ping.query();
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

/** Flush everything unsynced. Safe to call repeatedly (idempotent server-side). */
export async function flushSync(): Promise<{ ok: boolean; inserted: number; duplicates: number }> {
  if (syncing) return { ok: false, inserted: 0, duplicates: 0 };
  const meta = await getMeta();
  if (!meta) return { ok: false, inserted: 0, duplicates: 0 };

  const scans = await getUnsyncedScans();
  const reentryEvents = await getPendingReentryEvents();
  if (scans.length === 0 && reentryEvents.length === 0) {
    currentStatus = "online";
    await refreshUnsyncedCount();
    emit();
    return { ok: true, inserted: 0, duplicates: 0 };
  }

  syncing = true;
  currentStatus = "syncing";
  emit();

  try {
    const res = await client.offlineDoor.sync.mutate({
      eventId: meta.eventId,
      mode: meta.mode,
      deviceId: meta.deviceId,
      scans: scans.map((s) => ({
        token: s.token,
        result: s.result,
        reason: s.reason,
        lane: s.lane,
        scannedAtMs: s.scannedAtMs,
        overrideBy: s.overrideBy,
        wristbandNumber: s.wristbandNumber,
        edFlagged: s.edFlagged,
      })),
      reentryEvents,
    });

    // Mark local scans synced (those we just sent — server accepted or deduped them).
    const ids = scans.map((s) => s.id!).filter((id) => id != null);
    await markScansSynced(ids);
    await clearPendingReentry(reentryEvents.map((r) => r.token));

    lastSyncAt = Date.now();
    currentStatus = "online";
    await refreshUnsyncedCount();
    emit();
    return { ok: res.success, inserted: res.inserted, duplicates: res.duplicates };
  } catch {
    currentStatus = navigator.onLine ? "online" : "offline";
    await refreshUnsyncedCount();
    emit();
    return { ok: false, inserted: 0, duplicates: 0 };
  } finally {
    syncing = false;
  }
}

async function onConnectivityChange() {
  const reachable = navigator.onLine && (await ping());
  currentStatus = reachable ? "online" : "offline";
  await refreshUnsyncedCount();
  emit();
  if (reachable) {
    await flushSync();
  }
}

let started = false;

/** Begin watching connectivity + periodic auto-sync. Call once on the door page. */
export function startSyncService(intervalMs = 20000) {
  if (started) return;
  started = true;
  window.addEventListener("online", onConnectivityChange);
  window.addEventListener("offline", onConnectivityChange);
  // Initial probe + periodic retry loop.
  void onConnectivityChange();
  pingTimer = setInterval(() => void onConnectivityChange(), intervalMs);
}

export function stopSyncService() {
  if (!started) return;
  started = false;
  window.removeEventListener("online", onConnectivityChange);
  window.removeEventListener("offline", onConnectivityChange);
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

/** Manual "Sync Now" trigger for the Console. */
export async function syncNow(): Promise<{ ok: boolean; inserted: number; duplicates: number }> {
  const reachable = navigator.onLine && (await ping());
  if (!reachable) {
    currentStatus = "offline";
    emit();
    return { ok: false, inserted: 0, duplicates: 0 };
  }
  return flushSync();
}

/** Fetch a fresh dataset from the server (used by the Console "Load Door Data" button). */
export async function fetchDataset(eventId: number, mode: "banquet" | "pool") {
  return client.offlineDoor.loadData.query({ eventId, mode });
}
