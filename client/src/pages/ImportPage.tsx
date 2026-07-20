import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

type ImportRow = Record<string, unknown>;

const EXPECTED_COLUMNS = ["First Name", "Last Name", "Phone", "Email", "Team Name", "Team Code", "Center Name", "Hotel Check-In", "Hotel Check-Out", "Room Type", "Banquet Amount", "Is Captain", "Notes"];

export default function ImportPage() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [googleUrl, setGoogleUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [activeInput, setActiveInput] = useState<"file" | "google" | "paste">("file");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const EVENT_ID = 1;

  const importMutation = trpc.import.process.useMutation({
    onSuccess: (data) => {
      setImportResult(data as Record<string, unknown>);
      toast.success(`Import complete! ${(data as Record<string, unknown>).created} bowlers added.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const fetchGoogleSheet = trpc.import.fetchGoogleSheet.useMutation({
    onSuccess: (data) => {
      const d = data as { headers: string[]; rows: ImportRow[] };
      setHeaders(d.headers);
      setRows(d.rows);
      setPreview(true);
      toast.success(`Loaded ${d.rows.length} rows from Google Sheets`);
    },
    onError: (e) => toast.error(e.message),
  });

  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) { toast.error("File appears empty"); return; }
    const hdrs = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const parsed = lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const row: ImportRow = {};
      hdrs.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    }).filter((r) => Object.values(r).some((v) => v !== ""));
    setHeaders(hdrs);
    setRows(parsed);
    setPreview(true);
    toast.success(`Parsed ${parsed.length} rows`);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseCSV(String(ev.target?.result ?? ""));
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (rows.length === 0) return;
    importMutation.mutate({ rows, sourceType: "csv", eventId: EVENT_ID, leagueCode: "1" });
  };

  if (importResult) {
    const r = importResult;
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] rounded-2xl border border-green-500/30 p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-black text-green-400 mb-4">Import Complete!</h2>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[#111] rounded-xl p-3"><div className="text-2xl font-black text-green-400">{String(r.created ?? 0)}</div><div className="text-xs text-gray-500">Created</div></div>
            <div className="bg-[#111] rounded-xl p-3"><div className="text-2xl font-black text-blue-400">{String(r.updated ?? 0)}</div><div className="text-xs text-gray-500">Updated</div></div>
            <div className="bg-[#111] rounded-xl p-3"><div className="text-2xl font-black text-red-400">{String(r.errors ?? 0)}</div><div className="text-xs text-gray-500">Errors</div></div>
          </div>
          <button onClick={() => setLocation("/admin")} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl transition-all active:scale-95">View Roster</button>
          <button onClick={() => { setImportResult(null); setRows([]); setPreview(false); }} className="w-full mt-2 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">Import Another File</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="bg-[#1a1a1a] border-b border-cyan-500/30 px-4 py-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={() => setLocation("/admin")} className="text-gray-400 hover:text-white text-sm">← Admin</button>
          <h1 className="text-2xl font-black text-cyan-400" style={{ textShadow: "0 0 20px rgba(0,255,255,0.4)" }}>📥 IMPORT BOWLER DATA</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {!preview ? (
          <div className="space-y-5">
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5">
              <p className="text-gray-400 text-sm mb-4">Import bowler data from a CSV file, Google Sheets, or paste directly. The system will pre-generate 10-digit IDs for every bowler.</p>
              <div className="flex gap-2 mb-5">
                {(["file", "google", "paste"] as const).map((t) => (
                  <button key={t} onClick={() => setActiveInput(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeInput === t ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                    {t === "file" ? "📁 CSV File" : t === "google" ? "📊 Google Sheets" : "📋 Paste Data"}
                  </button>
                ))}
              </div>

              {activeInput === "file" && (
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} className="w-full py-8 border-2 border-dashed border-white/20 hover:border-cyan-500/50 rounded-xl text-gray-400 hover:text-cyan-400 transition-all text-center">
                    <div className="text-4xl mb-2">📁</div>
                    <div className="font-semibold">Click to select CSV file</div>
                    <div className="text-xs mt-1">Supports .csv and .txt files</div>
                  </button>
                </div>
              )}

              {activeInput === "google" && (
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Google Sheets Share URL</label>
                  <div className="flex gap-3">
                    <input value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
                    <button onClick={() => fetchGoogleSheet.mutate({ url: googleUrl })} disabled={fetchGoogleSheet.isPending || !googleUrl} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors">
                      {fetchGoogleSheet.isPending ? "Loading..." : "Load"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Make sure the sheet is shared as "Anyone with the link can view"</p>
                </div>
              )}

              {activeInput === "paste" && (
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Paste CSV data (first row = headers)</label>
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={8} placeholder="First Name,Last Name,Phone,Team Name,Center Name..." className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-cyan-500 resize-y" />
                  <button onClick={() => parseCSV(pasteText)} disabled={!pasteText.trim()} className="mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors">Parse Data</button>
                </div>
              )}
            </div>

            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Expected Column Names</h3>
              <div className="flex flex-wrap gap-2">
                {EXPECTED_COLUMNS.map((col) => (<span key={col} className="px-2 py-1 bg-[#111] rounded text-xs text-cyan-400 font-mono">{col}</span>))}
              </div>
              <p className="text-xs text-gray-500 mt-3">Column names are flexible — the system will prompt you to map unrecognized columns.</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{rows.length} rows ready to import</h2>
                <p className="text-gray-500 text-sm">Review the preview below, then click Import to proceed.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setPreview(false); setRows([]); }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">← Back</button>
                <button onClick={handleImport} disabled={importMutation.isPending} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-bold text-sm transition-colors">
                  {importMutation.isPending ? "Importing..." : `✅ Import ${rows.length} Bowlers`}
                </button>
              </div>
            </div>
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      {headers.slice(0, 8).map((h) => (<th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>))}
                      {headers.length > 8 && <th className="px-3 py-2 text-gray-500">+{headers.length - 8} more</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        {headers.slice(0, 8).map((h) => (<td key={h} className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-[120px] truncate">{String(row[h] ?? "")}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && <div className="px-4 py-2 text-xs text-gray-500">...and {rows.length - 20} more rows</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
