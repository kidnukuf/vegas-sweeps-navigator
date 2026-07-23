import { useState, useRef, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ImportRow = Record<string, unknown>;
type EventRecord = Record<string, unknown>;

/** Persistent banner shown on every step so the ED always knows which tab they are writing to. */
function SheetTargetBanner({ event }: { event: EventRecord | null }) {
  if (!event) return null;

  const spreadsheetId = String(event.sheetSpreadsheetId ?? "");
  const tabName = String(event.sheetTabName ?? "");
  const nickname = String(event.sheetTabNickname ?? "");
  const hasSheet = spreadsheetId && tabName;
  const lastSyncedMs = event.sheetLastSyncedAt ? Number(event.sheetLastSyncedAt) : null;
  const lastSyncedStr = lastSyncedMs ? new Date(lastSyncedMs).toLocaleString() : null;

  return (
    <div
      className={`rounded-lg px-4 py-3 mb-6 flex items-start gap-3 border ${
        hasSheet
          ? "bg-green-950/40 border-green-500/40"
          : "bg-yellow-950/40 border-yellow-500/40"
      }`}
    >
      <span className="text-xl mt-0.5">{hasSheet ? "🎯" : "⚠️"}</span>
      <div className="flex-1 min-w-0">
        {hasSheet ? (
          <>
            <p className="text-sm font-bold text-green-400 mb-0.5">Write-back target confirmed</p>
            <p className="text-xs text-gray-300">
              <span className="text-white font-semibold">Event:</span>{" "}
              {String(event.eventName)} · {String(event.eventYear)}
            </p>
            <p className="text-xs text-gray-300">
              <span className="text-white font-semibold">Sheet tab:</span>{" "}
              <span className="text-green-300 font-mono">{tabName}</span>
              {nickname && nickname !== tabName && (
                <span className="text-yellow-400/80 ml-2">({nickname})</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
              ID: {spreadsheetId}
            </p>
            <p className="text-xs mt-1">
              {lastSyncedStr ? (
                <span className="text-gray-400">Last synced: <span className="text-green-300">{lastSyncedStr}</span></span>
              ) : (
                <span className="text-gray-500 italic">Not yet synced to this sheet</span>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-yellow-400 mb-0.5">No sheet tab configured</p>
            <p className="text-xs text-gray-400">
              Open Event Settings → Sheet tab to connect a Google Sheet tab before writing back.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CompletionTabNote({ event }: { event: EventRecord | null }) {
  if (!event || !event.sheetTabName) return null;
  const tabName = String(event.sheetTabName);
  const nickname = String(event.sheetTabNickname ?? "");
  return (
    <p className="text-xs text-gray-400 mb-6">
      Data written to tab{" "}
      <span className="text-green-300 font-mono">{tabName}</span>
      {nickname && nickname !== tabName && (
        <span className="text-yellow-400/70 ml-1">({nickname})</span>
      )}
    </p>
  );
}

export default function MasterSheetImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [googleUrl, setGoogleUrl] = useState("");
  const [eventId, setEventId] = useState<number>(() => {
    const saved = Number(localStorage.getItem("vsn_selected_event_id"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const [step, setStep] = useState<"input" | "review" | "changes" | "complete">("input");
  const [changesSummary, setChangesSummary] = useState<any>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; error: string | null; mismatches: { col: number; expected: string; actual: string }[]; totalExpected: number; totalFound: number } | null>(null);

  const { data: events = [] } = trpc.event.list.useQuery();

  const [clearQRUsedInDBResult, setClearQRUsedInDBResult] = useState<{ bowlersCleared: number; guestTokensCleared: number; guestBowlersCleared: number; reentryTokensCleared: number } | null>(null);

  const clearQRUsedInDBMutation = trpc.masterSheet.clearQRUsedInDB.useMutation({
    onSuccess: (data) => {
      setClearQRUsedInDBResult(data);
      toast.success(`✅ DB cleared: ${data.bowlersCleared} bowler${data.bowlersCleared !== 1 ? "s" : ""}, ${data.guestTokensCleared} guest token${data.guestTokensCleared !== 1 ? "s" : ""}, ${data.reentryTokensCleared} reentry token${data.reentryTokensCleared !== 1 ? "s" : ""} reset.`);
    },
    onError: (err: any) => toast.error(`DB clear failed: ${err.message}`),
  });

  const clearQRUsedMutation = trpc.masterSheet.clearQRUsedColumns.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(`Clear failed: ${data.error}`);
      } else {
        toast.success(`✅ Cleared QR used data for ${data.cleared} rows in the Google Sheet.`);
      }
    },
    onError: (err: any) => toast.error(`Clear failed: ${err.message}`),
  });
  const activeEvent = useMemo(
    () => (events as EventRecord[]).find((e) => Number(e.id) === eventId) ?? null,
    [events, eventId]
  );

  const verifyTabHeadersQuery = trpc.event.verifyTabHeaders.useQuery(
    { spreadsheetId: String(activeEvent?.sheetSpreadsheetId ?? ""), tabName: String(activeEvent?.sheetTabName ?? "") },
    { enabled: false }
  );

  const handleVerifyHeaders = useCallback(async () => {
    if (!activeEvent?.sheetSpreadsheetId || !activeEvent?.sheetTabName) {
      toast.error("No sheet tab configured for this event. Set it in Event Settings first.");
      return;
    }
    setVerifyState("loading");
    setVerifyResult(null);
    try {
      const result = await verifyTabHeadersQuery.refetch();
      const data = result.data;
      if (!data) throw new Error("No response from server");
      setVerifyResult(data);
      setVerifyState(data.ok ? "ok" : "error");
      if (data.ok) {
        toast.success(`✅ All ${data.totalExpected} column headers verified — sheet is ready!`);
      } else {
        toast.error(`⚠️ ${data.mismatches.length} header mismatch${data.mismatches.length !== 1 ? "es" : ""} found`);
      }
    } catch (e: any) {
      setVerifyState("error");
      toast.error(e.message ?? "Verification failed");
    }
  }, [activeEvent, verifyTabHeadersQuery]);

  const fetchGoogleSheet = trpc.import.fetchGoogleSheet.useMutation({
    onSuccess: (data: any) => {
      const d = data as { headers: string[]; rows: ImportRow[] };
      setHeaders(d.headers);
      setRows(d.rows);
      setPreview(true);
      setStep("review");
      toast.success(`Loaded ${d.rows.length} rows from Google Sheets`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const detectChangesMutation = trpc.masterSheet.detectChanges.useQuery(
    { eventId, rows },
    { enabled: false }
  );

  const runDetectChanges = async () => {
    try {
      const result = await trpc.masterSheet.detectChanges.useQuery({ eventId, rows }).data;
      if (result) {
        setChangesSummary(result);
        setStep("changes");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number; failed: number; errors: string[] } | null>(null);
  const [regenResult, setRegenResult] = useState<{ updated: number; alreadyComplete: number; failed: number; errors: string[]; hasSheet: boolean } | null>(null);

  const regenMutation = trpc.masterSheet.regenerateMissingTokens.useMutation({
    onSuccess: (data) => {
      setRegenResult(data);
      if (data.updated === 0) {
        toast.success(`✅ All ${data.alreadyComplete} bowlers already have tokens — nothing to do!`);
      } else if (data.failed > 0) {
        toast.error(`Generated tokens for ${data.updated}, but ${data.failed} failed`);
      } else {
        const sheetNote = data.hasSheet ? " and written to sheet" : " (no sheet configured — tokens saved to DB only)";
        toast.success(`✅ Generated tokens for ${data.updated} bowler${data.updated !== 1 ? "s" : ""}${sheetNote}`);
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Regeneration failed"),
  });

  const bulkSyncMutation = trpc.masterSheet.bulkSyncQRCodes.useMutation({
    onSuccess: (data) => {
      setSyncResult(data);
      if (data.failed > 0) {
        toast.error(`Sync complete — ${data.synced} synced, ${data.failed} failed`);
      } else {
        toast.success(`✅ Synced QR codes for ${data.synced} bowler${data.synced !== 1 ? "s" : ""} to the sheet (${data.skipped} had no tokens)`);
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Bulk sync failed"),
  });

  const importMutation = trpc.masterSheet.importMasterSheet.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Imported ${data.imported} bowlers!`);
      if (data.errors > 0) {
        toast.error(`${data.errors} errors occurred`);
      }
      setStep("complete");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseCSV(String(ev.target?.result ?? ""));
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      toast.error("File appears empty");
      return;
    }
    const hdrs = lines[0].split("\t").map((h) => h.trim());
    const parsed = lines.slice(1).map((line) => {
      const vals = line.split("\t").map((v) => v.trim());
      const row: ImportRow = {};
      hdrs.forEach((h, i) => {
        row[h] = vals[i] ?? "";
      });
      return row;
    });
    setHeaders(hdrs);
    setRows(parsed);
    setPreview(true);
    setStep("review");
    toast.success(`Parsed ${parsed.length} rows`);
  };

  const handleDetectChanges = () => {
    if (rows.length === 0) return;
    runDetectChanges();
  };

  const handleImport = () => {
    if (rows.length === 0) return;
    importMutation.mutate({ rows, eventId });
  };

  const handleDownloadExport = async () => {
    try {
      const result = await trpc.masterSheet.exportToGoogleSheetFormat.useQuery({ eventId }).data;
      if (!result) return;
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(result.csv));
      element.setAttribute("download", `master-sheet-export-${eventId}.tsv`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Export downloaded!");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDownloadPiExport = async () => {
    try {
      const result = await trpc.masterSheet.exportForRaspberryPi.useQuery({ eventId }).data;
      if (!result) return;
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(result.csv));
      element.setAttribute("download", `raspberry-pi-export-${eventId}.tsv`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Pi export downloaded!");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDownloadFinalResults = async () => {
    try {
      const result = await trpc.masterSheet.exportFinalResults.useQuery({ eventId }).data;
      if (!result) return;
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(result.csv));
      element.setAttribute("download", `final-results-${eventId}.tsv`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Final results downloaded!");
    } catch (e) {
      toast.error(String(e));
    }
  };

  // Step 1: Input
  if (step === "input") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-black text-cyan-400 mb-8">📥 Master Sheet Import</h1>

          {/* Sheet target confirmation banner */}
          <SheetTargetBanner event={activeEvent} />

          <Card className="bg-[#1a1a1a] border-cyan-500/30 p-6 mb-6">
            {/* Event selector */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Event</label>
              <select
                value={eventId}
                onChange={(e) => {
                  const id = parseInt(e.target.value);
                  setEventId(id);
                  localStorage.setItem("vsn_selected_event_id", String(id));
                }}
                className="w-full px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                {(events as EventRecord[]).map((ev) => {
                  const nickname = String(ev.sheetTabNickname ?? "");
                  const tabName = String(ev.sheetTabName ?? "");
                  const label = `${String(ev.eventName)} · ${String(ev.eventYear)}${nickname ? ` (${nickname})` : tabName ? ` — tab: ${tabName}` : ""}`;
                  return (
                    <option key={String(ev.id)} value={String(ev.id)}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

          {/* Bulk Sync QR Codes */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Button
                onClick={() => {
                  if (!activeEvent?.sheetSpreadsheetId || !activeEvent?.sheetTabName) {
                    toast.error("No sheet tab configured for this event. Set it in Event Settings first.");
                    return;
                  }
                  setSyncResult(null);
                  bulkSyncMutation.mutate({ eventId });
                }}
                disabled={bulkSyncMutation.isPending || !activeEvent?.sheetSpreadsheetId || !activeEvent?.sheetTabName}
                className="bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold"
              >
                {bulkSyncMutation.isPending ? "⏳ Syncing QR codes..." : "📤 Bulk Sync QR Codes to Sheet"}
              </Button>
              {syncResult && (
                <span className="text-xs text-gray-400">
                  {syncResult.synced} synced · {syncResult.skipped} skipped · {syncResult.failed} failed
                </span>
              )}
            </div>
            {syncResult && syncResult.errors.length > 0 && (
              <div className="mt-2 p-3 bg-red-950/40 border border-red-500/30 rounded-lg">
                <p className="text-xs font-semibold text-red-400 mb-1">Failed rows:</p>
                <ul className="text-xs text-red-300 space-y-0.5">
                  {syncResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  {syncResult.errors.length > 10 && <li className="text-gray-500">…and {syncResult.errors.length - 10} more</li>}
                </ul>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Writes Pool QR, Banquet QR, and all Guest QR URLs for every bowler in this event to the configured sheet tab.
            </p>
          </div>

          {/* Regenerate Missing Tokens */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Button
                onClick={() => {
                  setRegenResult(null);
                  regenMutation.mutate({ eventId });
                }}
                disabled={regenMutation.isPending}
                className="bg-amber-700 hover:bg-amber-600 text-sm font-semibold"
              >
                {regenMutation.isPending ? "⏳ Generating tokens..." : "🔑 Regenerate Missing Tokens"}
              </Button>
              {regenResult && (
                <span className="text-xs text-gray-400">
                  {regenResult.updated} generated · {regenResult.alreadyComplete} already complete · {regenResult.failed} failed
                </span>
              )}
            </div>
            {regenResult && regenResult.errors.length > 0 && (
              <div className="mt-2 p-3 bg-red-950/40 border border-red-500/30 rounded-lg">
                <p className="text-xs font-semibold text-red-400 mb-1">Failed rows:</p>
                <ul className="text-xs text-red-300 space-y-0.5">
                  {regenResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  {regenResult.errors.length > 10 && <li className="text-gray-500">…and {regenResult.errors.length - 10} more</li>}
                </ul>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Generates Pool QR and Banquet QR tokens for any bowler that was imported before token generation was wired up. Safe to run multiple times — existing tokens are never overwritten.
            </p>
          </div>

          {/* Verify Tab Headers */}
          <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <Button
                  onClick={handleVerifyHeaders}
                  disabled={verifyState === "loading" || !activeEvent?.sheetSpreadsheetId || !activeEvent?.sheetTabName}
                  className={`text-sm font-semibold ${
                    verifyState === "ok"
                      ? "bg-green-700 hover:bg-green-600"
                      : verifyState === "error"
                      ? "bg-red-700 hover:bg-red-600"
                      : "bg-indigo-700 hover:bg-indigo-600"
                  }`}
                >
                  {verifyState === "loading" ? "🔍 Checking headers..." : verifyState === "ok" ? "✅ Headers verified" : verifyState === "error" ? "⚠️ Header issues found" : "🔍 Verify Tab Headers"}
                </Button>
                {verifyResult && (
                  <span className="text-xs text-gray-400">
                    {verifyResult.ok
                      ? `${verifyResult.totalExpected} of ${verifyResult.totalExpected} headers match`
                      : `${verifyResult.mismatches.length} mismatch${verifyResult.mismatches.length !== 1 ? "es" : ""} in ${verifyResult.totalFound} found / ${verifyResult.totalExpected} expected`}
                  </span>
                )}
              </div>
              {verifyResult && !verifyResult.ok && (
                <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-4 text-xs">
                  <p className="text-red-400 font-bold mb-2">Column header mismatches — do not import until resolved:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {verifyResult.mismatches.map((m) => (
                      <div key={m.col} className="flex gap-2">
                        <span className="text-gray-500 w-6 text-right shrink-0">#{m.col + 1}</span>
                        <span className="text-red-300 font-mono truncate">Expected: <span className="text-white">{m.expected}</span></span>
                        <span className="text-gray-500">→</span>
                        <span className="text-red-400 font-mono truncate">Got: <span className="text-yellow-300">{m.actual}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-bold text-white mb-4">Select Import Source</h2>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-cyan-500/30 rounded-lg p-6 text-center hover:border-cyan-500/60 transition-colors cursor-pointer">
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} className="hidden" />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full"
                  >
                    <div className="text-4xl mb-2">📁</div>
                    <div className="font-semibold">Click to select CSV/TSV file</div>
                    <div className="text-xs text-gray-500 mt-1">Or paste from Google Sheets</div>
                  </button>
                </div>

                <div className="border-2 border-dashed border-cyan-500/30 rounded-lg p-6">
                  <label className="text-sm font-semibold text-gray-300 mb-2 block">Or paste Google Sheets URL</label>
                  <div className="flex gap-2">
                    <input
                      value={googleUrl}
                      onChange={(e) => setGoogleUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="flex-1 px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <Button
                      onClick={() => fetchGoogleSheet.mutate({ url: googleUrl })}
                      disabled={fetchGoogleSheet.isPending || !googleUrl}
                      className="bg-cyan-600 hover:bg-cyan-500"
                    >
                      {fetchGoogleSheet.isPending ? "Loading..." : "Load"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          {/* Danger Zone */}
          <div className="border border-red-800/50 rounded-lg p-4 bg-red-950/20 space-y-3 mt-6">
            <p className="text-sm font-semibold text-red-400">⚠️ Danger Zone</p>
            <p className="text-xs text-gray-400">Only use these if QR codes were falsely marked as used (e.g. by link-preview bots) and no real scans have occurred.</p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  if (!window.confirm("Clear all QR used data from the Google Sheet? Only do this if no real scans have occurred.")) return;
                  clearQRUsedMutation.mutate({ eventId });
                }}
                disabled={clearQRUsedMutation.isPending}
                className="w-full bg-red-700 hover:bg-red-600 text-white text-sm"
              >
                {clearQRUsedMutation.isPending ? "Clearing Sheet..." : "🗑️ Clear QR Used Data from Google Sheet"}
              </Button>
              <Button
                onClick={() => {
                  if (!window.confirm("Clear all QR used flags from the database? This resets pool party and banquet used status for all bowlers in this event. Only do this if no real scans have occurred.")) return;
                  clearQRUsedInDBMutation.mutate({ eventId });
                }}
                disabled={clearQRUsedInDBMutation.isPending}
                className="w-full bg-red-900 hover:bg-red-800 text-white text-sm"
              >
                {clearQRUsedInDBMutation.isPending ? "Clearing DB..." : "🗑️ Clear QR Used Flags from Database"}
              </Button>
            </div>
            {clearQRUsedInDBResult && (
              <p className="text-xs text-green-400">✅ DB cleared: {clearQRUsedInDBResult.bowlersCleared} bowler{clearQRUsedInDBResult.bowlersCleared !== 1 ? "s" : ""}, {clearQRUsedInDBResult.guestTokensCleared} guest token{clearQRUsedInDBResult.guestTokensCleared !== 1 ? "s" : ""}, {clearQRUsedInDBResult.reentryTokensCleared} reentry token{clearQRUsedInDBResult.reentryTokensCleared !== 1 ? "s" : ""} reset.</p>
            )}
          </div>
          </Card>
        </div>
      </div>
    );
  }

  // Step 2: Review
  if (step === "review") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-black text-cyan-400 mb-4">📋 Review Data</h1>

          {/* Sheet target confirmation banner */}
          <SheetTargetBanner event={activeEvent} />

          <p className="text-gray-400 mb-6">{rows.length} rows ready to check for changes</p>

          <div className="flex gap-3 mb-6">
            <Button
              onClick={() => {
                setStep("input");
                setRows([]);
                setHeaders([]);
              }}
              className="bg-gray-700 hover:bg-gray-600"
            >
              ← Back
            </Button>
            <Button
              onClick={handleDetectChanges}
              disabled={detectChangesMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              {detectChangesMutation.isPending ? "Analyzing..." : "Detect Changes"}
            </Button>
          </div>

          <Card className="bg-[#1a1a1a] border-cyan-500/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-[#111]">
                    {headers.slice(0, 8).map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    {headers.length > 8 && <th className="px-3 py-2 text-gray-500">+{headers.length - 8} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      {headers.slice(0, 8).map((h) => (
                        <td key={h} className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-[120px] truncate">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <div className="px-4 py-2 text-xs text-gray-500">...and {rows.length - 20} more rows</div>}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Step 3: Changes Summary
  if (step === "changes" && changesSummary) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-black text-cyan-400 mb-6">📊 Change Summary</h1>

          {/* Sheet target confirmation banner */}
          <SheetTargetBanner event={activeEvent} />

          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="bg-[#1a1a1a] border-green-500/30 p-4">
              <div className="text-3xl font-black text-green-400">{changesSummary.newBowlers}</div>
              <div className="text-sm text-gray-400">New Bowlers</div>
            </Card>
            <Card className="bg-[#1a1a1a] border-blue-500/30 p-4">
              <div className="text-3xl font-black text-blue-400">{changesSummary.updatedBowlers}</div>
              <div className="text-sm text-gray-400">Updated Bowlers</div>
            </Card>
          </div>

          <Card className="bg-[#1a1a1a] border-cyan-500/30 p-6 mb-6 max-h-96 overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4">Changes</h2>
            <div className="space-y-2">
              {changesSummary.changes.map((change: any, i: number) => (
                <div key={i} className="text-sm p-2 bg-[#111] rounded border border-white/10">
                  <div className="font-semibold text-cyan-400">
                    {change.firstName} {change.lastName}
                  </div>
                  {change.type === "new" ? (
                    <div className="text-green-400 text-xs">New bowler</div>
                  ) : (
                    <div className="text-blue-400 text-xs">
                      Updated: {Object.keys(change.changes || {}).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setStep("review");
                setChangesSummary(null);
              }}
              className="bg-gray-700 hover:bg-gray-600"
            >
              ← Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="bg-green-600 hover:bg-green-500"
            >
              {importMutation.isPending ? "Importing..." : "✅ Import All"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Complete
  if (step === "complete") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <Card className="bg-[#1a1a1a] border-green-500/30 p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-black text-green-400 mb-2">Import Complete!</h2>

          {/* Compact sheet target reminder on completion */}
          <CompletionTabNote event={activeEvent} />

          <div className="space-y-3 mb-6">
            <Button onClick={handleDownloadExport} className="w-full bg-cyan-600 hover:bg-cyan-500">
              📥 Download Master Sheet Export
            </Button>
            <Button onClick={handleDownloadPiExport} className="w-full bg-purple-600 hover:bg-purple-500">
              🥧 Download Raspberry Pi Export
            </Button>
            <Button onClick={handleDownloadFinalResults} className="w-full bg-green-600 hover:bg-green-500">
              🎉 Download Final Results
            </Button>
          </div>

          <div className="border border-red-800/50 rounded-lg p-4 bg-red-950/20 space-y-2 mb-4">
            <p className="text-sm font-semibold text-red-400">⚠️ Danger Zone</p>
            <p className="text-xs text-gray-400">Only use this if QR codes were falsely marked as used (e.g. by link-preview bots) and no real scans have occurred. Clears all QR used timestamps from the Google Sheet.</p>
            <Button
              onClick={() => {
                if (!window.confirm("Are you sure? This clears all QR used data from the Google Sheet. Only do this if no real scans have occurred.")) return;
                clearQRUsedMutation.mutate({ eventId });
              }}
              disabled={clearQRUsedMutation.isPending}
              className="w-full bg-red-700 hover:bg-red-600 text-white"
            >
              {clearQRUsedMutation.isPending ? "Clearing..." : "🗑️ Clear All QR Used Data from Sheet"}
            </Button>
          </div>
          <Button
            onClick={() => {
              setStep("input");
              setRows([]);
              setHeaders([]);
              setChangesSummary(null);
            }}
            className="w-full bg-gray-700 hover:bg-gray-600"
          >
            Import Another File
          </Button>
        </Card>
      </div>
    );
  }

  return null;
}
