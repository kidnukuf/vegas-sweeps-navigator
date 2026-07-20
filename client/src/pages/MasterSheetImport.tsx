import { useState, useRef, useMemo } from "react";
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

  const { data: events = [] } = trpc.event.list.useQuery();
  const activeEvent = useMemo(
    () => (events as EventRecord[]).find((e) => Number(e.id) === eventId) ?? null,
    [events, eventId]
  );

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
