import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ParsedRow {
  rowIndex: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  centerName: string;
  teamName: string;
  teamCode: string;
  bowlerPosition: string;
  isCapitain: boolean;
  hotelCheckin: string;
  hotelCheckout: string;
  roomType: string;
  roommateFirst: string;
  roommateLast: string;
  roomAmount: string;
  banquetAmount: string;
  poolParty: boolean;
  totalDue: string;
  paid: boolean;
  errors: string[];
  raw: Record<string, string>;
}

// Column name aliases — maps common header variants to canonical field names
const COLUMN_ALIASES: Record<string, string> = {
  "first name": "firstName", "first": "firstName", "fname": "firstName", "bowler first": "firstName",
  "last name": "lastName", "last": "lastName", "lname": "lastName", "bowler last": "lastName",
  "phone": "phone", "phone number": "phone", "cell": "phone", "mobile": "phone",
  "email": "email", "email address": "email",
  "center": "centerName", "bowling center": "centerName", "center name": "centerName",
  "team": "teamName", "team name": "teamName",
  "team #": "teamCode", "team number": "teamCode", "team code": "teamCode", "team no": "teamCode",
  "position": "bowlerPosition", "pos": "bowlerPosition", "bowler position": "bowlerPosition", "bowler #": "bowlerPosition",
  "captain": "isCapitain", "is captain": "isCapitain", "cap": "isCapitain",
  "check in": "hotelCheckin", "check-in": "hotelCheckin", "checkin": "hotelCheckin", "hotel check in": "hotelCheckin", "arrival": "hotelCheckin",
  "check out": "hotelCheckout", "check-out": "hotelCheckout", "checkout": "hotelCheckout", "hotel check out": "hotelCheckout", "departure": "hotelCheckout",
  "room type": "roomType", "room": "roomType",
  "roommate first": "roommateFirst", "roommate first name": "roommateFirst",
  "roommate last": "roommateLast", "roommate last name": "roommateLast",
  "room amount": "roomAmount", "room cost": "roomAmount", "hotel amount": "roomAmount",
  "banquet": "banquetAmount", "banquet amount": "banquetAmount", "banquet cost": "banquetAmount",
  "pool party": "poolParty", "pool": "poolParty",
  "total": "totalDue", "total due": "totalDue", "amount due": "totalDue", "total amount": "totalDue",
  "paid": "paid", "payment status": "paid", "paid y/n": "paid",
  // Display-only aliases (server stores these via raw headers / notes)
  "squad time": "squadTime", "lane #": "laneNumber", "lane": "laneNumber",
  "gender": "gender", "under 21?": "under21", "under 21": "under21",
  "sanction #": "sanctionNumber", "sanction": "sanctionNumber",
  "# games": "numGames", "high avg": "highAvg", "best avg": "bestAvg",
  "book 25-26": "book2526", "book 24-25": "book2425", "book 23-24": "book2324",
  "1st choice squad": "choiceSquad1", "2nd choice squad": "choiceSquad2",
  "league member": "leagueMember", "returning bowler?": "returningBowler",
  "t-shirt size": "shirtSize", "room with bowler?": "roomWithBowler",
  "banquet $80": "banquetAmount", "guest $15": "guestAmount", "special notes": "specialNotes",
  "extra banquet": "extraBanquet", "extra pool party": "extraPoolParty",
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (!inQuotes && (ch === "," || ch === "\t")) { row.push(current.trim()); current = ""; continue; }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (current.trim() || row.length > 0) { row.push(current.trim()); rows.push(row); row = []; current = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    current += ch;
  }
  if (current.trim() || row.length > 0) { row.push(current.trim()); rows.push(row); }
  return rows;
}

function mapHeaders(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    if (COLUMN_ALIASES[key]) map[i] = COLUMN_ALIASES[key];
  });
  return map;
}

function parseRows(rawRows: string[][], headerMap: Record<number, string>, headers: string[]): ParsedRow[] {
  return rawRows.map((row, idx) => {
    const get = (field: string) => {
      const colIdx = Object.entries(headerMap).find(([, v]) => v === field)?.[0];
      return colIdx !== undefined ? (row[Number(colIdx)] ?? "").trim() : "";
    };
    // Build raw record keyed by ORIGINAL header names so the server's header-based lookups work
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = (row[i] ?? "").trim(); });
    const errors: string[] = [];
    const firstName = get("firstName");
    const lastName = get("lastName");
    if (!firstName) errors.push("Missing first name");
    if (!lastName) errors.push("Missing last name");
    const centerName = get("centerName");
    if (!centerName) errors.push("Missing center name");
    return {
      rowIndex: idx + 2,
      firstName, lastName,
      phone: get("phone"),
      email: get("email"),
      centerName,
      teamName: get("teamName"),
      teamCode: get("teamCode"),
      bowlerPosition: get("bowlerPosition"),
      isCapitain: ["yes", "true", "1", "y"].includes(get("isCapitain").toLowerCase()),
      hotelCheckin: get("hotelCheckin"),
      hotelCheckout: get("hotelCheckout"),
      roomType: get("roomType"),
      roommateFirst: get("roommateFirst"),
      roommateLast: get("roommateLast"),
      roomAmount: get("roomAmount"),
      banquetAmount: get("banquetAmount"),
      poolParty: ["yes", "true", "1", "y"].includes(get("poolParty").toLowerCase()),
      totalDue: get("totalDue"),
      paid: ["yes", "true", "1", "y", "paid"].includes(get("paid").toLowerCase()),
      errors,
      raw,
    };
  });
}

export default function ImportData() {
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<number, string>>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; errors: number; generatedIds: string[] } | null>(null);
  const [googleUrl, setGoogleUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [activeTab, setActiveTab] = useState<"file" | "google" | "paste">("file");
  const [isDragging, setIsDragging] = useState(false);

  // Import into the event currently selected in the Event Director dashboard.
  const [selectedEventId] = useState<number>(() => {
    const saved = Number(localStorage.getItem("vsn_selected_event_id"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const { data: events = [] } = trpc.event.list.useQuery();
  const selectedEvent = (events as Record<string, unknown>[]).find((e) => Number(e.id) === selectedEventId) ?? null;

  const importMutation = trpc.import.process.useMutation({
    onSuccess: (data: unknown) => {
      const d = data as { imported: number; updated: number; errors: number; generatedIds: string[] };
      setImportResult({ imported: d.imported ?? 0, updated: d.updated ?? 0, errors: d.errors ?? 0, generatedIds: d.generatedIds ?? [] });
      setStep("done");
      const total = (d.imported ?? 0) + (d.updated ?? 0);
      toast.success(`\u2705 Imported ${d.imported ?? 0} new, updated ${d.updated ?? 0} (${total} total)!`);
    },
    onError: (e: { message: string }) => toast.error(`Import failed: ${e.message}`),
  });

  const processText = useCallback((text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) { toast.error("No data rows found. Make sure the file has a header row."); return; }
    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()));
    const hMap = mapHeaders(headers);
    setRawHeaders(headers);
    setHeaderMap(hMap);
    setParsedRows(parseRows(dataRows, hMap, headers));
    setStep("preview");
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => processText(e.target?.result as string);
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleGoogleFetch = async () => {
    if (!googleUrl.trim()) { toast.error("Enter a Google Sheets URL"); return; }
    // Convert share URL to CSV export URL
    let csvUrl = googleUrl;
    const match = googleUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
    try {
      const resp = await fetch(`/api/proxy-csv?url=${encodeURIComponent(csvUrl)}`);
      if (!resp.ok) throw new Error("Failed to fetch sheet");
      const text = await resp.text();
      processText(text);
    } catch {
      toast.error("Could not fetch Google Sheet. Make sure it is shared publicly (Anyone with link can view).");
    }
  };

  const handleImport = () => {
    const validRows = parsedRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) { toast.error("No valid rows to import."); return; }
    // Send the RAW row data keyed by original headers so the server's header-based lookups work
    const rawRows = validRows.map(r => r.raw);
    importMutation.mutate({ rows: rawRows as unknown as Record<string, unknown>[], eventId: selectedEventId, sourceType: activeTab === "google" ? "google_sheets" : activeTab === "paste" ? "paste" : "csv", sourceName: activeTab === "file" ? "uploaded file" : activeTab === "google" ? googleUrl : "pasted data" });
  };

  const errorCount = parsedRows.filter(r => r.errors.length > 0).length;
  const validCount = parsedRows.length - errorCount;

  return (
    <div className="min-h-screen bg-[#0d0d0d]" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Header */}
      <div className="border-b border-yellow-500/20 bg-black/60 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/admin")} className="text-gray-400 hover:text-yellow-400 text-sm transition-colors">← Admin</button>
        <span className="text-gray-600">|</span>
        <span className="text-2xl">📥</span>
        <h1 className="text-xl font-black text-yellow-400 tracking-widest" style={{ textShadow: "0 0 12px rgba(255,215,0,0.5)" }}>
          IMPORT BOWLER DATA
        </h1>
        <span className="ml-auto text-xs text-gray-400">
          Importing into:{" "}
          <span className="text-yellow-300 font-semibold">
            {selectedEvent ? `${selectedEvent.eventName} · ${selectedEvent.eventYear}` : `Event #${selectedEventId}`}
          </span>
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {step === "upload" && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="neon-card p-5 border-cyan-500/30">
              <h2 className="text-cyan-400 font-bold text-lg mb-2">📋 How the Import Works</h2>
              <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
                <li>Upload your roster CSV, paste a Google Sheets link, or paste raw data</li>
                <li>The system detects column headers automatically</li>
                <li>Review and fix any errors before importing</li>
                <li>Each bowler gets a unique 10-digit scantron ID generated automatically</li>
                <li>Bowlers can then sign up and claim their pre-generated record</li>
              </ol>
            </div>

            {/* Tab Selector */}
            <div className="flex gap-2">
              {(["file", "google", "paste"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === tab ? "bg-yellow-500 text-black" : "bg-[#1a1a1a] text-gray-400 hover:text-yellow-400 border border-white/10"}`}>
                  {tab === "file" ? "📁 CSV File" : tab === "google" ? "📊 Google Sheets" : "📋 Paste Data"}
                </button>
              ))}
            </div>

            {/* File Upload Tab */}
            {activeTab === "file" && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${isDragging ? "border-yellow-400 bg-yellow-400/10" : "border-white/20 hover:border-yellow-500/50 hover:bg-yellow-500/5"}`}>
                <div className="text-5xl mb-4">📂</div>
                <p className="text-white font-bold text-lg">Drop your CSV file here</p>
                <p className="text-gray-500 text-sm mt-1">or click to browse — supports .csv, .txt, .tsv</p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            )}

            {/* Google Sheets Tab */}
            {activeTab === "google" && (
              <div className="neon-card p-6 space-y-4">
                <p className="text-gray-300 text-sm">Paste your Google Sheets share URL. The sheet must be set to <strong className="text-yellow-400">"Anyone with the link can view"</strong>.</p>
                <input
                  className="neon-input"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={googleUrl}
                  onChange={(e) => setGoogleUrl(e.target.value)}
                />
                <button onClick={handleGoogleFetch} className="neon-btn-gold w-full py-3">
                  📊 Fetch Google Sheet
                </button>
              </div>
            )}

            {/* Paste Tab */}
            {activeTab === "paste" && (
              <div className="neon-card p-6 space-y-4">
                <p className="text-gray-300 text-sm">Copy cells from any spreadsheet (including the header row) and paste below.</p>
                <textarea
                  className="neon-input"
                  rows={10}
                  placeholder={"First Name\tLast Name\tPhone\tCenter\tTeam\n..."}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  style={{ resize: "vertical" }}
                />
                <button onClick={() => processText(pastedText)} className="neon-btn-gold w-full py-3">
                  📋 Process Pasted Data
                </button>
              </div>
            )}

            {/* Column Guide */}
            <div className="neon-card p-5">
              <h3 className="text-yellow-400 font-bold mb-3">📌 Recognized Column Headers</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-400">
                {["First Name", "Last Name", "Phone", "Email", "Center", "Team Name", "Team #", "Position", "Captain", "Check In", "Check Out", "Room Type", "Roommate First", "Roommate Last", "Room Amount", "Banquet", "Pool Party", "Total Due", "Paid"].map(h => (
                  <span key={h} className="bg-[#111] rounded px-2 py-1 font-mono">{h}</span>
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-3">Many variations are recognized automatically (e.g., "fname", "cell", "arrival", etc.)</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="neon-card p-4 text-center">
                <div className="text-3xl font-black text-white">{parsedRows.length}</div>
                <div className="text-gray-400 text-sm">Total Rows</div>
              </div>
              <div className="neon-card p-4 text-center">
                <div className="text-3xl font-black text-green-400">{validCount}</div>
                <div className="text-gray-400 text-sm">Ready to Import</div>
              </div>
              <div className="neon-card p-4 text-center">
                <div className="text-3xl font-black text-red-400">{errorCount}</div>
                <div className="text-gray-400 text-sm">Errors</div>
              </div>
            </div>

            {/* Column Mapping */}
            <div className="neon-card p-4">
              <h3 className="text-yellow-400 font-bold mb-3">🗂 Column Mapping Detected</h3>
              <div className="flex flex-wrap gap-2">
                {rawHeaders.map((h, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded font-mono ${headerMap[i] ? "bg-green-900/40 text-green-400 border border-green-500/30" : "bg-red-900/20 text-red-400 border border-red-500/20"}`}>
                    {h} {headerMap[i] ? `→ ${headerMap[i]}` : "⚠ unmapped"}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview Table */}
            <div className="neon-card overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="text-cyan-400 font-bold">Preview (first 20 rows)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-2 text-gray-500">#</th>
                      <th className="text-left p-2 text-gray-400">Name</th>
                      <th className="text-left p-2 text-gray-400">Center</th>
                      <th className="text-left p-2 text-gray-400">Team</th>
                      <th className="text-left p-2 text-gray-400">Pos</th>
                      <th className="text-left p-2 text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 20).map((row) => (
                      <tr key={row.rowIndex} className={`border-b border-white/5 ${row.errors.length > 0 ? "bg-red-900/10" : ""}`}>
                        <td className="p-2 text-gray-600">{row.rowIndex}</td>
                        <td className="p-2 text-white font-semibold">{row.firstName} {row.lastName}</td>
                        <td className="p-2 text-gray-300">{row.centerName || <span className="text-red-400">—</span>}</td>
                        <td className="p-2 text-gray-300">{row.teamName || row.teamCode || "—"}</td>
                        <td className="p-2 text-gray-300">{row.bowlerPosition || "—"}</td>
                        <td className="p-2">
                          {row.errors.length === 0
                            ? <span className="badge-registered">✓ Valid</span>
                            : <span className="badge-pending" title={row.errors.join(", ")}>⚠ {row.errors[0]}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 20 && (
                <div className="p-3 text-center text-gray-500 text-xs border-t border-white/10">
                  +{parsedRows.length - 20} more rows not shown
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setStep("upload")} className="neon-btn-cyan flex-1 py-3">
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={validCount === 0 || importMutation.isPending}
                className="neon-btn-gold flex-[2] py-3 disabled:opacity-50 disabled:cursor-not-allowed">
                {importMutation.isPending ? "⏳ Importing..." : `🚀 Import ${validCount} Bowlers`}
              </button>
            </div>
          </div>
        )}

        {step === "done" && importResult && (
          <div className="space-y-6 text-center">
            <div className="neon-card p-10">
              <div className="text-6xl mb-4">🎳</div>
              <h2 className="text-3xl font-black text-yellow-400 mb-2" style={{ textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>
                Import Complete!
              </h2>
              <div className="grid grid-cols-2 gap-4 mt-6 mb-6">
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
                  <div className="text-3xl font-black text-green-400">{importResult.imported}</div>
                  <div className="text-gray-400 text-sm">Bowlers Imported</div>
                </div>
                <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
                  <div className="text-3xl font-black text-red-400">{importResult.errors}</div>
                  <div className="text-gray-400 text-sm">Rows Skipped</div>
                </div>
              </div>
              {importResult.generatedIds.length > 0 && (
                <div className="bg-[#111] rounded-xl p-4 text-left mb-6">
                  <p className="text-gray-400 text-xs mb-2 font-semibold">SAMPLE GENERATED IDs:</p>
                  <div className="flex flex-wrap gap-2">
                    {importResult.generatedIds.slice(0, 10).map(id => (
                      <span key={id} className="font-mono text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-500/30 rounded px-2 py-1">{id}</span>
                    ))}
                    {importResult.generatedIds.length > 10 && <span className="text-gray-500 text-xs">+{importResult.generatedIds.length - 10} more</span>}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setStep("upload"); setImportResult(null); setParsedRows([]); }} className="neon-btn-cyan flex-1 py-3">
                  Import More
                </button>
                <button onClick={() => navigate("/admin")} className="neon-btn-gold flex-[2] py-3">
                  → View Admin Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
