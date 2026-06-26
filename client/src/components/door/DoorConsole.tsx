/**
 * DoorConsole — the laptop-screen control + resolution station.
 *
 * Sits on the laptop between the two TVs. Nobody touches it during normal scanning;
 * the doorman walks to it only to (a) resolve a STEP-ASIDE denial, (b) issue a
 * re-entry pass, or (c) check status. Handles: mode toggle, online/offline + unsynced
 * indicator, Load Door Data, Sync Now, PIN setup/override, guest lookup, ED flagging,
 * and the directional reentry manager.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getMeta,
  loadDataset,
  searchGuests,
  setPin,
  verifyPin,
  getLocalCounts,
  getUnsyncedCount,
  getAllReentry,
  getAllGuests,
  nextAvailableReentry,
  issueReentryLocal,
  releaseReentryLocal,
  getReentryByToken,
  type DoorMode,
  type GuestRecord,
  type ReentryZone,
  type ScanResult,
} from "@/lib/offlineDoorDb";
import { overrideAdmit, flagForEd } from "@/lib/offlineDoorEngine";
import { trpc } from "@/lib/trpc";
import {
  subscribeConn,
  syncNow,
  fetchDataset,
  type ConnStatus,
} from "@/lib/offlineDoorSync";

const ZONES: ReentryZone[] = ["N", "E", "S", "W"];
const ZONE_LABEL: Record<ReentryZone, string> = { N: "North", E: "East", S: "South", W: "West" };

export function DoorConsole({ eventId }: { eventId: number }) {
  const [mode, setMode] = useState<DoorMode>("banquet");
  const [eventName, setEventName] = useState<string>("");
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [hasPin, setHasPin] = useState(false);

  const [conn, setConn] = useState<{ status: ConnStatus; unsynced: number; lastSyncAt: number | null }>({
    status: "offline",
    unsynced: 0,
    lastSyncAt: null,
  });
  const [counts, setCounts] = useState<Record<ScanResult, number>>({
    admitted: 0,
    denied_used: 0,
    denied_notfound: 0,
    override_admitted: 0,
    reentry_admitted: 0,
    denied_wrongzone: 0,
  });

  const [loading, setLoading] = useState(false);

  // Refresh meta + counts periodically.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const meta = await getMeta();
      if (!alive) return;
      if (meta) {
        setMode(meta.mode);
        setEventName(meta.eventName);
        setLoadedAt(meta.loadedAtMs);
        setHasPin(Boolean(meta.pinHash));
      }
      setCounts(await getLocalCounts());
      setGuestCount((await getAllGuests()).length);
      const unsynced = await getUnsyncedCount();
      setConn((c) => ({ ...c, unsynced }));
    }
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => subscribeConn(setConn), []);

  async function handleLoad(nextMode: DoorMode) {
    setLoading(true);
    try {
      const data = await fetchDataset(eventId, nextMode);
      await loadDataset({
        eventId: data.eventId,
        mode: data.mode,
        eventName: data.eventName,
        loadedAtMs: data.loadedAtMs,
        guests: data.guests,
        reentry: data.reentry,
      });
      setMode(nextMode);
      setEventName(data.eventName);
      setLoadedAt(data.loadedAtMs);
      setGuestCount(data.guestCount);
      const meta = await getMeta();
      setHasPin(Boolean(meta?.pinHash));
      toast.success(`Loaded ${data.guestCount} ${nextMode === "banquet" ? "banquet" : "pool party"} passes + ${data.reentryCount} re-entry codes`);
    } catch {
      toast.error("Could not load data. Connect to the internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncNow() {
    const res = await syncNow();
    if (res.ok) toast.success(`Synced. ${res.inserted} new, ${res.duplicates} already on server.`);
    else toast.error("Sync failed — still offline. Will auto-retry when online.");
  }

  const statusColor =
    conn.status === "online" ? "bg-emerald-500" : conn.status === "syncing" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header / status bar */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div className="text-2xl font-bold">{eventName || "Door Console"}</div>
          <div className="text-sm text-muted-foreground">
            Mode:{" "}
            <span className="font-semibold capitalize">
              {mode === "banquet" ? "Banquet" : "Pool Party"}
            </span>{" "}
            · {guestCount > 0 ? `${guestCount} passes loaded` : "no data loaded"}
            {loadedAt && ` · loaded ${new Date(loadedAt).toLocaleTimeString()}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold text-white ${statusColor}`}>
            <span className="h-2 w-2 rounded-full bg-white" />
            {conn.status === "syncing" ? "Syncing…" : conn.status === "online" ? "Online" : "Offline"}
          </span>
          {conn.unsynced > 0 && (
            <Badge variant="secondary" className="text-sm">
              {conn.unsynced} unsynced
            </Badge>
          )}
        </div>
      </Card>

      {/* Mode + data controls */}
      <Card className="space-y-4 p-4">
        <div className="text-lg font-semibold">Setup</div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant={mode === "banquet" ? "default" : "outline"}
            onClick={() => handleLoad("banquet")}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Load Banquet Data
          </Button>
          <Button
            variant={mode === "pool" ? "default" : "outline"}
            onClick={() => handleLoad("pool")}
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            Load Pool Party Data
          </Button>
          <Button variant="outline" onClick={handleSyncNow} disabled={conn.status === "offline"}>
            Sync Now
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Load the data while you still have internet. After that the door works fully offline — every scan is
          saved on this laptop and uploads automatically when the connection returns.
        </p>
        <PinSetup hasPin={hasPin} onChanged={() => setHasPin(true)} />
      </Card>

      {/* Live counts */}
      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Admitted" value={counts.admitted} tone="good" />
        <Stat label="Re-entry" value={counts.reentry_admitted} tone="good" />
        <Stat label="Override" value={counts.override_admitted} tone="warn" />
        <Stat label="Already In" value={counts.denied_used} tone="bad" />
        <Stat label="Not Found" value={counts.denied_notfound} tone="bad" />
        <Stat label="Wrong Door" value={counts.denied_wrongzone} tone="bad" />
      </Card>

      {/* Export check-ins to the Google Sheet (manual paste) */}
      <ExportPanel eventId={eventId} mode={mode} />

      {/* Resolution */}
      <ResolutionPanel hasPin={hasPin} />

      {/* Reentry manager */}
      <ReentryManager />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-red-600";
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function PinSetup({ hasPin, onChanged }: { hasPin: boolean; onChanged: () => void }) {
  const [pin, setPinVal] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/40 p-3">
      <div>
        <div className="text-sm font-semibold">Override PIN {hasPin && <span className="text-emerald-600">✓ set</span>}</div>
        <div className="text-xs text-muted-foreground">Required to force-admit a denied guest.</div>
      </div>
      <Input
        type="password"
        inputMode="numeric"
        placeholder="4–8 digits"
        value={pin}
        onChange={(e) => setPinVal(e.target.value)}
        className="w-40"
      />
      <Button
        size="sm"
        disabled={pin.length < 4}
        onClick={async () => {
          await setPin(pin);
          setPinVal("");
          onChanged();
          toast.success("Override PIN saved on this laptop.");
        }}
      >
        {hasPin ? "Change PIN" : "Set PIN"}
      </Button>
    </div>
  );
}

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  // Quote if it contains comma, quote, or newline; escape inner quotes.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ExportPanel({ eventId, mode }: { eventId: number; mode: DoorMode }) {
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();

  async function handleExport() {
    setBusy(true);
    try {
      const data = await utils.offlineDoor.exportCheckins.fetch({ eventId, mode });
      if (!data || data.rows.length === 0) {
        toast.error("No check-ins to export yet. Sync first if you scanned offline.");
        return;
      }
      // Build a human-friendly CSV. One row per admitted guest, sorted by name.
      // Columns: Last, First, Lane, Team, what to paste, and which sheet column it goes in.
      const header = [
        "Last Name",
        "First Name",
        "Lane",
        "Team",
        "Sheet Column",
        "Paste This Value",
        "Scanned At (local)",
        "Re-entry?",
      ];
      const lines: string[] = [];
      // Instruction banner rows (Excel/Sheets show them as the first rows).
      lines.push(csvCell("HOW TO USE: In your Google Sheet, find each person by Last+First name and Lane."));
      lines.push(csvCell('Paste the "Paste This Value" (the scan time) into the listed Sheet Column for that row ONLY.'));
      lines.push(csvCell("Banquet -> column AC | Pool Party -> column AE | Guest Pool -> column AG. Do NOT paste into column A."));
      lines.push("");
      lines.push(header.map(csvCell).join(","));
      for (const r of data.rows) {
        lines.push(
          [
            csvCell(r.lastName),
            csvCell(r.firstName),
            csvCell(r.laneNumber),
            csvCell(r.teamNumber),
            csvCell(r.targetColumn),
            csvCell(new Date(r.scannedAtMs).toLocaleString()),
            csvCell(new Date(r.scannedAtMs).toLocaleString()),
            csvCell(r.isReentry ? "yes" : ""),
          ].join(",")
        );
      }
      if (data.unmatched.length > 0) {
        lines.push("");
        lines.push(csvCell(`UNMATCHED (${data.unmatched.length}) — could not find a name for these tokens; review manually:`));
        lines.push(["Token", "Scanned At (local)", "Result"].map(csvCell).join(","));
        for (const u of data.unmatched) {
          lines.push([csvCell(u.token), csvCell(new Date(u.scannedAtMs).toLocaleString()), csvCell(u.result)].join(","));
        }
      }
      const csv = lines.join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `checkins-${mode}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.rows.length} check-ins${data.unmatched.length ? ` (+${data.unmatched.length} unmatched)` : ""}.`);
    } catch {
      toast.error("Export failed. Make sure you're online and have synced your scans.");
    } finally {
      setBusy(false);
    }
  }

  const targetCol = mode === "banquet" ? "AC" : "AE";
  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="text-lg font-semibold">Export Check-ins (to Google Sheet)</div>
        <div className="text-sm text-muted-foreground">
          Download a spreadsheet of everyone who was admitted, matched to your sheet by name + lane. Open it,
          then paste the scan-time column into column <span className="font-semibold">{targetCol}</span>{" "}
          (guest pool → AG) next to each person. It only fills the "used/confirmed" column — your existing data
          is untouched.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleExport} disabled={busy} className="bg-purple-600 hover:bg-purple-700">
          {busy ? "Preparing…" : "Export Check-ins (.csv)"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Tip: sync first so offline scans are included. Best opened on the laptop, not a phone.
        </span>
      </div>
    </Card>
  );
}

function ResolutionPanel({ hasPin }: { hasPin: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuestRecord[]>([]);
  const [selected, setSelected] = useState<GuestRecord | null>(null);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [edFlag, setEdFlag] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await searchGuests(query);
      if (alive) setResults(r);
    })();
    return () => {
      alive = false;
    };
  }, [query]);

  async function doOverride() {
    if (!selected) return;
    if (!hasPin) {
      toast.error("Set an Override PIN first (in Setup).");
      return;
    }
    if (!(await verifyPin(pin))) {
      toast.error("Wrong PIN.");
      return;
    }
    await overrideAdmit({
      token: selected.token,
      lane: null,
      overrideBy: "PIN",
      reason: reason || "Manual override at console",
      edFlagged: edFlag,
    });
    toast.success(`${selected.displayName} admitted by override.`);
    setSelected(null);
    setPin("");
    setReason("");
    setEdFlag(false);
    setQuery("");
  }

  async function doFlag() {
    if (!selected) return;
    await flagForEd({ token: selected.token, lane: null, reason: reason || "Flagged at console" });
    toast.success(`${selected.displayName} flagged for the Event Director.`);
    setSelected(null);
    setReason("");
    setQuery("");
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="text-lg font-semibold">Step-Aside Resolution</div>
        <div className="text-sm text-muted-foreground">
          Look up the guest who was denied, see why, then admit by PIN or flag for the Event Director.
        </div>
      </div>
      <Input
        placeholder="Search by name, team #, or team name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <div className="max-h-48 space-y-1 overflow-auto rounded-lg border p-2">
          {results.length === 0 && <div className="p-2 text-sm text-muted-foreground">No matches.</div>}
          {results.map((g) => (
            <button
              key={g.token}
              onClick={() => setSelected(g)}
              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted ${
                selected?.token === g.token ? "bg-muted" : ""
              }`}
            >
              <span>
                <span className="font-semibold">{g.displayName}</span>
                {g.teamNumber && <span className="ml-2 text-muted-foreground">Team {g.teamNumber}</span>}
              </span>
              <span className="text-xs">
                {g.alreadyUsedAtLoad || g.usedThisSession ? (
                  <Badge variant="destructive">already in</Badge>
                ) : (
                  <Badge variant="secondary">not scanned</Badge>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-3 rounded-lg border-2 border-indigo-200 bg-indigo-50/50 p-4">
          <div className="font-semibold">
            {selected.displayName}
            {selected.teamNumber && <span className="ml-2 text-muted-foreground">· Team {selected.teamNumber}</span>}
          </div>
          <div className="text-sm">
            Status:{" "}
            {selected.alreadyUsedAtLoad || selected.usedThisSession ? (
              <span className="font-semibold text-red-600">Already scanned in (possible double-entry)</span>
            ) : (
              <span className="font-semibold text-emerald-600">Valid — not yet scanned</span>
            )}
          </div>
          <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs font-semibold">Override PIN</div>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-36"
                placeholder="PIN"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edFlag} onChange={(e) => setEdFlag(e.target.checked)} />
              Flag for Event Director
            </label>
            <Button onClick={doOverride} className="bg-emerald-600 hover:bg-emerald-700">
              Override-Admit
            </Button>
            <Button variant="outline" onClick={doFlag}>
              Flag only
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReentryManager() {
  const [zone, setZone] = useState<ReentryZone>("N");
  const [wristband, setWristband] = useState("");
  const [poolState, setPoolState] = useState<{ zone: string; inUse: boolean; linkedWristband: string | null; token: string }[]>([]);
  const [releaseToken, setReleaseToken] = useState("");

  async function refresh() {
    const all = await getAllReentry();
    setPoolState(all.map((r) => ({ zone: r.zone, inUse: r.inUse, linkedWristband: r.linkedWristband, token: r.token })));
  }
  useEffect(() => {
    void refresh();
  }, []);

  const byZone = useMemo(() => {
    const m: Record<string, { total: number; used: number }> = {};
    for (const r of poolState) {
      m[r.zone] = m[r.zone] ?? { total: 0, used: 0 };
      m[r.zone].total++;
      if (r.inUse) m[r.zone].used++;
    }
    return m;
  }, [poolState]);

  async function issue() {
    if (!wristband.trim()) {
      toast.error("Enter the guest's wristband number.");
      return;
    }
    const code = await nextAvailableReentry(zone);
    if (!code) {
      toast.error(`No free re-entry codes left in ${ZONE_LABEL[zone]}.`);
      return;
    }
    await issueReentryLocal(code.token, wristband.trim());
    await refresh();
    toast.success(`Re-entry issued: ${code.token} → band #${wristband.trim()} (${ZONE_LABEL[zone]})`);
    setWristband("");
  }

  async function release() {
    const t = releaseToken.trim();
    if (!t) return;
    const rec = await getReentryByToken(t);
    if (!rec) {
      toast.error("Code not found.");
      return;
    }
    await releaseReentryLocal(t);
    await refresh();
    toast.success(`Released ${t} back to the pool.`);
    setReleaseToken("");
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="text-lg font-semibold">Re-entry Passes (directional)</div>
        <div className="text-sm text-muted-foreground">
          Issue a reusable re-entry code locked to the door zone. The guest scans it to come back in at the SAME zone.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ZONES.map((z) => (
          <div key={z} className="rounded-lg border p-2 text-center">
            <div className="text-sm font-semibold">{ZONE_LABEL[z]}</div>
            <div className="text-xs text-muted-foreground">
              {byZone[z] ? `${byZone[z].total - byZone[z].used} free / ${byZone[z].total}` : "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs font-semibold">Zone</div>
          <div className="flex gap-1">
            {ZONES.map((z) => (
              <Button key={z} size="sm" variant={zone === z ? "default" : "outline"} onClick={() => setZone(z)}>
                {z}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold">Wristband #</div>
          <Input value={wristband} onChange={(e) => setWristband(e.target.value)} className="w-36" placeholder="e.g. 142" />
        </div>
        <Button onClick={issue} className="bg-indigo-600 hover:bg-indigo-700">
          Issue Re-entry
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <div>
          <div className="text-xs font-semibold">Release a code</div>
          <Input
            value={releaseToken}
            onChange={(e) => setReleaseToken(e.target.value)}
            className="w-56"
            placeholder="paste code e.g. RE-BQ-N-1-001"
          />
        </div>
        <Button variant="outline" onClick={release}>
          Release
        </Button>
      </div>
    </Card>
  );
}
