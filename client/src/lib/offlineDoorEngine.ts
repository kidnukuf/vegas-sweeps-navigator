/**
 * offlineDoorEngine — on-device scan decision logic (ZERO network).
 *
 * Decision order for a normal entry scan:
 *   1. Reentry token?  → validate zone-lock (reentry codes only valid at issuing zone)
 *   2. Found in guest list?  → if not → DENIED_NOTFOUND
 *   3. Already used (load-time OR this session)?  → DENIED_USED
 *   4. Otherwise → ADMITTED (consume immediately)
 *
 * Every decision is written to scanLog AND (on admit) flips the guest's used flag,
 * so a token used on ANY lane is instantly dead on all four (shared IndexedDB).
 *
 * A per-token in-flight lock prevents a double-scan race (two lanes scanning the
 * same code in the same tick) from admitting twice.
 */
import {
  getGuest,
  getReentryByToken,
  markGuestUsed,
  appendScanLog,
  getMeta,
  markPurpleColumn,
  type DoorMode,
  type ReentryZone,
  type ScanResult,
} from "./offlineDoorDb";

export interface ScanDecision {
  result: ScanResult;
  admit: boolean;
  /** Short banner headline (green/red). */
  headline: string;
  /** Secondary line: name / team / reason. */
  detail: string;
  displayName: string | null;
  teamNumber: string | null;
  token: string;
  isReentry: boolean;
}

// In-memory lock: tokens currently being processed (prevents same-tick double admit).
const inFlight = new Set<string>();

function normalize(raw: string): string {
  return raw.trim();
}

/**
 * Process a normal-entry scan (the main scanner path).
 * `zone` is the lane's assigned reentry zone (used only to validate reentry codes).
 */
export async function processScan(
  rawToken: string,
  opts: { lane: number; zone: ReentryZone | null }
): Promise<ScanDecision> {
  const token = normalize(rawToken);
  const meta = await getMeta();
  const mode: DoorMode = meta?.mode ?? "banquet";
  const eventId = meta?.eventId ?? 0;

  const baseLog = {
    token,
    mode,
    eventId,
    lane: opts.lane,
    scannedAtMs: Date.now(),
    overrideBy: null as string | null,
    wristbandNumber: null as string | null,
    edFlagged: false,
    syncedAt: null as number | null,
  };

  if (!token) {
    return {
      result: "denied_notfound",
      admit: false,
      headline: "INVALID",
      detail: "Empty scan",
      displayName: null,
      teamNumber: null,
      token,
      isReentry: false,
    };
  }

  // Guard against same-token simultaneous processing.
  if (inFlight.has(token)) {
    return {
      result: "denied_used",
      admit: false,
      headline: "DENIED",
      detail: "Scan already in progress",
      displayName: null,
      teamNumber: null,
      token,
      isReentry: false,
    };
  }
  inFlight.add(token);

  try {
    // ── 1. Reentry token? ──────────────────────────────────────────────────────
    const re = await getReentryByToken(token);
    if (re) {
      // Zone-lock: a reentry code is only valid at the zone that issued it.
      if (!re.inUse) {
        await appendScanLog({ ...baseLog, result: "denied_notfound", reason: "Reentry code not issued" });
        return {
          result: "denied_notfound",
          admit: false,
          headline: "DENIED",
          detail: `Re-entry code not active (${re.zone})`,
          displayName: null,
          teamNumber: null,
          token,
          isReentry: true,
        };
      }
      if (opts.zone && re.zone !== opts.zone) {
        await appendScanLog({
          ...baseLog,
          result: "denied_wrongzone",
          reason: `Reentry zone ${re.zone} scanned at ${opts.zone}`,
        });
        return {
          result: "denied_wrongzone",
          admit: false,
          headline: "WRONG DOOR",
          detail: `Re-entry valid at ${re.zone} only`,
          displayName: re.linkedWristband ? `Band #${re.linkedWristband}` : null,
          teamNumber: null,
          token,
          isReentry: true,
        };
      }
      // Valid reentry admit — does NOT consume an entry token (reusable).
      await appendScanLog({
        ...baseLog,
        result: "reentry_admitted",
        wristbandNumber: re.linkedWristband,
        reason: `Re-entry ${re.zone}`,
      });
      return {
        result: "reentry_admitted",
        admit: true,
        headline: "RE-ENTRY OK",
        detail: re.linkedWristband ? `Band #${re.linkedWristband} (${re.zone})` : `Zone ${re.zone}`,
        displayName: re.linkedWristband ? `Band #${re.linkedWristband}` : null,
        teamNumber: null,
        token,
        isReentry: true,
      };
    }

    // ── 2. In guest list? ──────────────────────────────────────────────────────
    const guest = await getGuest(token);
    if (!guest) {
      await appendScanLog({ ...baseLog, result: "denied_notfound", reason: "Token not in list" });
      return {
        result: "denied_notfound",
        admit: false,
        headline: "NOT FOUND",
        detail: "Not on the list — step aside",
        displayName: null,
        teamNumber: null,
        token,
        isReentry: false,
      };
    }

    // ── 3. Already used? ───────────────────────────────────────────────────────
    if (guest.alreadyUsedAtLoad || guest.usedThisSession) {
      await appendScanLog({ ...baseLog, result: "denied_used", reason: "Already redeemed" });
      return {
        result: "denied_used",
        admit: false,
        headline: "ALREADY IN",
        detail: `${guest.displayName} — already scanned`,
        displayName: guest.displayName,
        teamNumber: guest.teamNumber,
        token,
        isReentry: false,
      };
    }

    // ── 4. Admit + consume ─────────────────────────────────────────────────────
    await markGuestUsed(token);
    await appendScanLog({ ...baseLog, result: "admitted", reason: null });
    // Mark purple column locally (write "X" to indicate used).
    await markPurpleColumn(token);
    return {
      result: "admitted",
      admit: true,
      headline: "WELCOME",
      detail: `${guest.displayName}${guest.teamNumber ? ` · Team ${guest.teamNumber}` : ""}`,
      displayName: guest.displayName,
      teamNumber: guest.teamNumber,
      token,
      isReentry: false,
    };
  } finally {
    inFlight.delete(token);
  }
}

/**
 * PIN-authorized override admit (from the Console resolution screen).
 * Admits a denied guest anyway and logs who authorized it. Optionally ED-flags.
 */
export async function overrideAdmit(opts: {
  token: string;
  lane: number | null;
  overrideBy: string;
  reason: string;
  edFlagged: boolean;
}): Promise<void> {
  const meta = await getMeta();
  const guest = await getGuest(opts.token);
  if (guest) {
    await markGuestUsed(opts.token);
    // Mark purple column locally on override admit.
    await markPurpleColumn(opts.token);
  }
  await appendScanLog({
    token: opts.token,
    result: "override_admitted",
    reason: opts.reason,
    lane: opts.lane,
    mode: meta?.mode ?? "banquet",
    eventId: meta?.eventId ?? 0,
    scannedAtMs: Date.now(),
    overrideBy: opts.overrideBy,
    wristbandNumber: null,
    edFlagged: opts.edFlagged,
    syncedAt: null,
  });
}

/** Log a manual ED flag (suspicious scan) without admitting. */
export async function flagForEd(opts: {
  token: string;
  lane: number | null;
  reason: string;
}): Promise<void> {
  const meta = await getMeta();
  await appendScanLog({
    token: opts.token,
    result: "denied_used",
    reason: opts.reason,
    lane: opts.lane,
    mode: meta?.mode ?? "banquet",
    eventId: meta?.eventId ?? 0,
    scannedAtMs: Date.now(),
    overrideBy: null,
    wristbandNumber: null,
    edFlagged: true,
    syncedAt: null,
  });
}
