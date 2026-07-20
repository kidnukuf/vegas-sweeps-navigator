import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  parseRow,
  runSeatingAlgorithm,
  buildVenueGrid,
  leagueColor,
  LEAGUE_NAMES,
  type SeatingRow,
  type SeatAssignment,
  type SeatingResult,
} from "@/lib/seatingAlgorithm";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_TABLES = 80;
const DEFAULT_SEATS = 8;

type Step = "setup" | "upload" | "config" | "confirm" | "output";

// ─── Venue Grid Visual ────────────────────────────────────────────────────────
function VenueGrid({
  tableMap,
  onTableClick,
  highlightTable,
}: {
  tableMap: Map<number, SeatAssignment[]>;
  onTableClick?: (tableNum: number) => void;
  highlightTable?: number | null;
}) {
  const grid = buildVenueGrid();

  // Build a flat grid for display: 14 cols × 6 rows
  // grid[col] = array of table numbers in that column (top to bottom)
  // We need to map col+row to table number
  const colRowToTable: Record<string, number> = {};

  // Left section (cols 0–6): col 0 has 5 tables (rows 0–4), cols 1–6 have 6 tables (rows 0–5)
  let tableCounter = 1;
  for (let col = 0; col < 7; col++) {
    const maxRow = col === 0 ? 5 : 6;
    for (let row = 0; row < maxRow; row++) {
      colRowToTable[`${col},${row}`] = tableCounter++;
    }
  }
  // Right section (cols 7–13):
  // col 7: rows 1–5 (row 0 blocked), cols 8–11: rows 0–5, cols 12–13: rows 0–4 (row 5 blocked)
  for (let col = 7; col < 14; col++) {
    const relCol = col - 7;
    let startRow = 0;
    let endRow = 6;
    if (relCol === 0) { startRow = 1; endRow = 6; }
    else if (relCol >= 5) { startRow = 0; endRow = 5; }
    for (let row = startRow; row < endRow; row++) {
      colRowToTable[`${col},${row}`] = tableCounter++;
    }
  }

  const cells: React.ReactElement[] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 14; col++) {
      const tNum = colRowToTable[`${col},${row}`];
      if (!tNum) {
        cells.push(
          <div
            key={`${col}-${row}`}
            className="w-10 h-10 rounded-full opacity-0"
          />
        );
        continue;
      }

      const occupants = tableMap.get(tNum) ?? [];
      const isEmpty = occupants.length === 0;
      // Determine dominant league color for this table
      const llCounts: Record<string, number> = {};
      for (const a of occupants) {
        llCounts[a.ll] = (llCounts[a.ll] ?? 0) + 1;
      }
      const dominantLl = Object.entries(llCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const bgColor = dominantLl ? leagueColor(dominantLl) : undefined;
      const isHighlighted = highlightTable === tNum;

      cells.push(
        <button
          key={`${col}-${row}`}
          onClick={() => onTableClick?.(tNum)}
          title={`Table ${tNum} — ${occupants.length} seated`}
          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all
            ${isEmpty ? "border-gray-600 bg-gray-800 text-gray-500" : "border-yellow-400 text-white"}
            ${isHighlighted ? "ring-2 ring-white scale-125" : "hover:scale-110"}
          `}
          style={bgColor && !isEmpty ? { backgroundColor: bgColor, borderColor: bgColor } : undefined}
        >
          {tNum}
        </button>
      );
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block p-4 bg-gray-900 rounded-xl border border-gray-700">
        {/* Section labels */}
        <div className="flex mb-2">
          <div className="text-center text-xs text-blue-400 font-semibold" style={{ width: "7 * 2.75rem" }}>
            <span className="mr-2">◀ LEFT SECTION (Tables 1–41)</span>
          </div>
          <div className="text-center text-xs text-yellow-400 font-semibold ml-4">
            <span>RIGHT SECTION (Tables 42–80) ▶</span>
          </div>
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(14, 2.75rem)" }}
        >
          {cells}
        </div>
        {/* Column numbers */}
        <div
          className="grid gap-1 mt-1"
          style={{ gridTemplateColumns: "repeat(14, 2.75rem)" }}
        >
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="text-center text-[9px] text-gray-500">
              C{i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Confirmation Grid ────────────────────────────────────────────────────────
function ConfirmationGrid({ result, rows }: { result: SeatingResult; rows: SeatingRow[] }) {
  const sorted = [...result.assignments].sort((a, b) => a.originalIndex - b.originalIndex);

  return (
    <div className="overflow-auto max-h-[60vh]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr>
            <th className="text-left px-3 py-2 text-gray-400 border-b border-gray-700">Row #</th>
            <th className="text-left px-3 py-2 text-gray-400 border-b border-gray-700">ID</th>
            <th className="text-left px-3 py-2 text-gray-400 border-b border-gray-700">Name</th>
            <th className="text-left px-3 py-2 text-gray-400 border-b border-gray-700">League</th>
            <th className="text-left px-3 py-2 text-gray-400 border-b border-gray-700">Center</th>
            <th className="text-left px-3 py-2 text-gray-400 border-b border-gray-700">Seat Code</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const color = leagueColor(a.ll);
            return (
              <tr key={a.originalIndex} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="px-3 py-1.5 text-gray-400 font-mono">{a.originalIndex + 2}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-gray-300">{a.rawId}</td>
                <td className="px-3 py-1.5 text-white">{a.name}</td>
                <td className="px-3 py-1.5">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-bold text-white"
                    style={{ backgroundColor: color, border: `1px solid ${color}` }}
                  >
                    {a.ll}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-300 font-mono text-xs">{a.cc}</td>
                <td className="px-3 py-1.5">
                  <span className="font-mono font-bold text-yellow-400 text-base">{a.seatCode}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SeatingChart() {
  const [step, setStep] = useState<Step>("setup");
  const [eventTitle, setEventTitle] = useState("");
  const [pasteData, setPasteData] = useState("");
  const [maxSeats, setMaxSeats] = useState(DEFAULT_SEATS);
  const [rows, setRows] = useState<SeatingRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [result, setResult] = useState<SeatingResult | null>(null);
  const [highlightTable, setHighlightTable] = useState<number | null>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  // ── Parse uploaded data ──────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    const lines = pasteData.trim().split(/\r?\n/).filter(Boolean);
    const parsed: SeatingRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Support tab-separated (ID\tName) or comma-separated (ID,Name) or just ID
      const parts = line.includes("\t")
        ? line.split("\t")
        : line.includes(",")
        ? line.split(",")
        : [line, ""];

      const rawId = parts[0]?.trim() ?? "";
      const name = parts[1]?.trim() || `Row ${i + 2}`;

      const row = parseRow(rawId, name, i);
      if (row) {
        parsed.push(row);
      } else {
        errors.push(`Row ${i + 2}: "${rawId}" — not a valid 10-digit bowler ID or 11-char guest ID`);
      }
    }

    if (parsed.length === 0) {
      toast.error("No valid IDs found. Check your data format.");
      return;
    }

    setRows(parsed);
    setParseErrors(errors);
    if (errors.length > 0) {
      toast.warning(`${errors.length} row(s) could not be parsed and will be skipped.`);
    } else {
      toast.success(`${parsed.length} records parsed successfully.`);
    }
    setStep("config");
  }, [pasteData]);

  // ── Run algorithm ────────────────────────────────────────────────────────
  const handleRunAlgorithm = useCallback(() => {
    const res = runSeatingAlgorithm(rows, maxSeats, MAX_TABLES);
    setResult(res);
    if (res.warnings.length > 0) {
      res.warnings.forEach(w => toast.warning(w));
    }
    setStep("confirm");
  }, [rows, maxSeats]);

  // ── Build output column ──────────────────────────────────────────────────
  const buildOutput = useCallback((): string => {
    if (!result) return "";
    const maxRow = Math.max(...Array.from(result.byOriginalIndex.keys()), -1);
    const lines: string[] = [];
    for (let i = 0; i <= maxRow; i++) {
      const a = result.byOriginalIndex.get(i);
      lines.push(a ? a.seatCode : "");
    }
    return lines.join("\n");
  }, [result]);

  const handleCopyOutput = useCallback(() => {
    const text = buildOutput();
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Seat codes copied! Paste starting at Row 2 of your Google Sheet.");
    });
  }, [buildOutput]);

  // ── League legend ────────────────────────────────────────────────────────
  const usedLeagues = result
    ? Array.from(new Set(result.assignments.map(a => a.ll))).sort()
    : [];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-yellow-400" style={{ textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>
              🪑 Seating Chart
            </h1>
            <p className="text-blue-300 text-sm mt-1">
              Funtime Team Challenge — Automated Banquet Seating Assignment
            </p>
          </div>
          {eventTitle && (
            <Badge className="ml-auto bg-blue-900 text-blue-200 border-blue-600 text-base px-4 py-1">
              {eventTitle}
            </Badge>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {(["setup", "upload", "config", "confirm", "output"] as Step[]).map((s, idx) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2
                  ${step === s ? "bg-yellow-400 text-black border-yellow-400" :
                    ["setup", "upload", "config", "confirm", "output"].indexOf(step) > idx
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-gray-800 text-gray-500 border-gray-600"}`}
              >
                {idx + 1}
              </div>
              <span className={`text-xs capitalize ${step === s ? "text-yellow-400 font-semibold" : "text-gray-500"}`}>
                {s === "setup" ? "Event Title" : s === "upload" ? "Upload Data" : s === "config" ? "Configure" : s === "confirm" ? "Confirm" : "Output"}
              </span>
              {idx < 4 && <span className="text-gray-700">→</span>}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Setup ── */}
        {step === "setup" && (
          <Card className="bg-gray-900 border-blue-800 max-w-lg">
            <CardHeader>
              <CardTitle className="text-yellow-400">Step 1 — Name This Seating Chart</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-300">Event Title</Label>
                <Input
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  placeholder="e.g. Funtime Team Challenge 2026 — Banquet"
                  className="bg-gray-800 border-gray-600 text-white mt-1"
                />
              </div>
              <Button
                onClick={() => setStep("upload")}
                disabled={!eventTitle.trim()}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
              >
                Continue →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Upload ── */}
        {step === "upload" && (
          <Card className="bg-gray-900 border-blue-800 max-w-2xl">
            <CardHeader>
              <CardTitle className="text-yellow-400">Step 2 — Upload Bowler Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-400 text-sm">
                Paste your data below. Each line should contain a <strong className="text-white">10-digit Bowler ID</strong> (optionally followed by a tab or comma and the bowler's name).
                Guest IDs are 11 characters: the host's 10-digit ID followed by a letter (A, B, C...).
              </p>
              <div className="bg-gray-800 rounded p-3 text-xs font-mono text-gray-400 space-y-1">
                <div>Format options:</div>
                <div className="text-green-400">0312607 01    (ID only)</div>
                <div className="text-green-400">0312607 01	James Smith    (ID + tab + name)</div>
                <div className="text-green-400">0312607 01,James Smith    (ID + comma + name)</div>
                <div className="text-blue-400">0312607 01A	Guest of James    (guest ID)</div>
              </div>
              <Textarea
                value={pasteData}
                onChange={e => setPasteData(e.target.value)}
                placeholder="Paste bowler IDs here (one per line)..."
                className="bg-gray-800 border-gray-600 text-white font-mono text-sm min-h-[200px]"
              />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("setup")} className="border-gray-600 text-gray-300">
                  ← Back
                </Button>
                <Button
                  onClick={handleParse}
                  disabled={!pasteData.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  Parse Data →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: Configure ── */}
        {step === "config" && (
          <div className="space-y-6 max-w-2xl">
            <Card className="bg-gray-900 border-blue-800">
              <CardHeader>
                <CardTitle className="text-yellow-400">Step 3 — Configure Tables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-300">Max Seats Per Table</Label>
                    <Input
                      type="number"
                      min={2}
                      max={20}
                      value={maxSeats}
                      onChange={e => setMaxSeats(Math.max(2, Math.min(20, parseInt(e.target.value) || 8)))}
                      className="bg-gray-800 border-gray-600 text-white mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 8. Seats labeled A–{String.fromCharCode(64 + maxSeats)}.</p>
                  </div>
                  <div>
                    <Label className="text-gray-300">Max Tables</Label>
                    <Input
                      value={MAX_TABLES}
                      disabled
                      className="bg-gray-700 border-gray-600 text-gray-400 mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Fixed at 80 per venue spec.</p>
                  </div>
                </div>

                <Separator className="bg-gray-700" />

                <div className="text-sm text-gray-400 space-y-1">
                  <div>Records parsed: <span className="text-white font-bold">{rows.length}</span></div>
                  <div>Bowlers: <span className="text-white font-bold">{rows.filter(r => !r.isGuest).length}</span></div>
                  <div>Guests: <span className="text-white font-bold">{rows.filter(r => r.isGuest).length}</span></div>
                  <div>Unique centers (CC): <span className="text-white font-bold">{new Set(rows.map(r => r.cc)).size}</span></div>
                  <div>Unique leagues (LL): <span className="text-white font-bold">{new Set(rows.map(r => r.ll)).size}</span></div>
                  {parseErrors.length > 0 && (
                    <div className="text-yellow-500">⚠ {parseErrors.length} rows skipped (unparseable IDs)</div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("upload")} className="border-gray-600 text-gray-300">
                    ← Back
                  </Button>
                  <Button
                    onClick={handleRunAlgorithm}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
                  >
                    Run Seating Algorithm →
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── STEP 4: Confirm ── */}
        {step === "confirm" && result && (
          <div className="space-y-6">
            <Card className="bg-gray-900 border-blue-800">
              <CardHeader>
                <CardTitle className="text-yellow-400">Step 4 — Confirm Seating Assignments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="bg-gray-800 rounded px-3 py-2">
                    <span className="text-gray-400">Seated: </span>
                    <span className="text-green-400 font-bold">{result.assignments.length}</span>
                  </div>
                  <div className="bg-gray-800 rounded px-3 py-2">
                    <span className="text-gray-400">Tables used: </span>
                    <span className="text-yellow-400 font-bold">{result.tableMap.size}</span>
                  </div>
                  {result.warnings.length > 0 && (
                    <div className="bg-yellow-900/40 border border-yellow-600 rounded px-3 py-2 text-yellow-400">
                      ⚠ {result.warnings.length} warning(s)
                    </div>
                  )}
                </div>

                {/* League color legend */}
                {usedLeagues.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">League Color Key:</p>
                    <div className="flex flex-wrap gap-2">
                      {usedLeagues.map(ll => (
                        <span
                          key={ll}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-white"
                          style={{ backgroundColor: leagueColor(ll) }}
                        >
                          {ll} — {LEAGUE_NAMES[ll]?.split("—")[1]?.trim() ?? ll}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Venue grid */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Venue Grid — click a table to highlight it in the list below:</p>
                  <VenueGrid
                    tableMap={result.tableMap}
                    onTableClick={setHighlightTable}
                    highlightTable={highlightTable}
                  />
                </div>

                {/* Confirmation table */}
                <ConfirmationGrid result={result} rows={rows} />

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep("config")} className="border-gray-600 text-gray-300">
                    ← Reconfigure
                  </Button>
                  <Button
                    onClick={() => setStep("output")}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold"
                  >
                    Confirm & Generate Output →
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── STEP 5: Output ── */}
        {step === "output" && result && (
          <div className="space-y-6 max-w-2xl">
            <Card className="bg-gray-900 border-green-700">
              <CardHeader>
                <CardTitle className="text-green-400">Step 5 — Copy-Paste Output</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-400 text-sm">
                  The column below contains one seat code per row, in the <strong className="text-white">exact order of your uploaded file</strong>.
                  Copy it and paste starting at <strong className="text-yellow-400">Row 2</strong> of your Google Sheet's seat assignment column.
                </p>
                <p className="text-gray-400 text-sm">
                  Format: <span className="font-mono text-yellow-300">XX-O</span> where XX = table number (zero-padded) and O = seat letter.
                  Example: <span className="font-mono text-yellow-300">04-H</span> = Table 4, Seat H.
                </p>

                <div className="flex gap-3">
                  <Button
                    onClick={handleCopyOutput}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg py-6"
                  >
                    📋 Copy All Seat Codes
                  </Button>
                </div>

                <Textarea
                  ref={outputRef}
                  value={buildOutput()}
                  readOnly
                  className="bg-gray-800 border-gray-600 text-yellow-300 font-mono text-sm min-h-[300px]"
                />

                <Separator className="bg-gray-700" />

                <div className="text-xs text-gray-500 space-y-1">
                  <div>Total rows in output: <span className="text-white">{buildOutput().split("\n").length}</span></div>
                  <div>Seated: <span className="text-white">{result.assignments.length}</span></div>
                  <div>Empty rows (unmatched/skipped): <span className="text-white">{buildOutput().split("\n").filter(l => !l.trim()).length}</span></div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("setup");
                    setEventTitle("");
                    setPasteData("");
                    setRows([]);
                    setResult(null);
                    setParseErrors([]);
                  }}
                  className="w-full border-gray-600 text-gray-300"
                >
                  ↺ Start New Seating Chart
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
