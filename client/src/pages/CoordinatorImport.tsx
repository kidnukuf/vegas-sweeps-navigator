import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { ArrowLeft, Download, FileSpreadsheet, FileUp, LockKeyhole, TableProperties, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasVerifiedEventDirectorAccess, isLegacyEventDirectorSessionCandidate } from "@/lib/portalAccess";
import {
  buildCoordinatorImport,
  MASTER_PASTE_HEADERS,
  type CoordinatorImportResult,
} from "@shared/coordinatorImport";

const ED_TOKEN_KEY = "vsn_ed_token";

function matrixFromPastedGrid(text: string) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) =>
    line.split(text.includes("\t") ? "\t" : ",").map((cell) => cell.trim()),
  );
}

function statusClass(status: string) {
  if (status === "Error") return "border-rose-400/40 bg-rose-500/10 text-rose-100";
  if (status === "Merge-2nd-squad") return "border-violet-400/40 bg-violet-500/10 text-violet-100";
  if (status === "Update") return "border-amber-400/40 bg-amber-500/10 text-amber-100";
  return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
}

export default function CoordinatorImport() {
  const [, setLocation] = useLocation();
  const { loading: ownerLoading, isAuthenticated, user } = useAuth();
  const [sourceName, setSourceName] = useState("");
  const [sourceMatrix, setSourceMatrix] = useState<string[][]>([]);
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [leagueCode, setLeagueCode] = useState("");
  const [eventCode, setEventCode] = useState("");
  const [result, setResult] = useState<CoordinatorImportResult | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storedToken = typeof window === "undefined" ? null : localStorage.getItem(ED_TOKEN_KEY);
  const isOwnerSession = Boolean(isAuthenticated && user?.role === "admin");
  const staffAccessQuery = trpc.edStaff.access.useQuery(undefined, { retry: false });
  const legacyAccessQuery = trpc.edStaff.legacyAccess.useQuery(
    { token: storedToken ?? "" },
    { enabled: isLegacyEventDirectorSessionCandidate(storedToken), retry: false },
  );
  const hasAccess = hasVerifiedEventDirectorAccess({
    isOwnerSession,
    staffAccess: staffAccessQuery.data,
    legacyAccess: legacyAccessQuery.data,
  });
  const centersQuery = trpc.centers.list.useQuery(undefined, { enabled: hasAccess });

  useEffect(() => {
    if (!ownerLoading && !staffAccessQuery.isLoading && !legacyAccessQuery.isLoading && !hasAccess) {
      setLocation("/ed", { replace: true });
    }
  }, [hasAccess, legacyAccessQuery.isLoading, ownerLoading, setLocation, staffAccessQuery.isLoading]);

  const centers = useMemo(() => (centersQuery.data ?? []).map((center: Record<string, unknown>) => ({
    centerName: String(center.centerName ?? ""),
    centerCode: center.centerCode as string | number | null | undefined,
  })), [centersQuery.data]);

  const processMatrix = useCallback((matrix: string[][], name: string) => {
    if (matrix.length < 2 || matrix[0].length === 0) {
      toast.error("Include a header row and at least one coordinator data row.");
      return;
    }
    setSourceName(name);
    setSourceMatrix(matrix);
    setSourceHeaders(matrix[0].map((header) => String(header ?? "").trim()));
    setResult(null);
    toast.success(`${matrix.length - 1} coordinator row${matrix.length === 2 ? "" : "s"} ready to review.`);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
      toast.error("Choose an .xlsx or .csv coordinator file.");
      return;
    }
    setIsReadingFile(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error("The workbook does not contain a worksheet.");
      const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], { header: 1, defval: "", raw: false });
      processMatrix(values.map((row) => row.map((cell) => String(cell ?? ""))), `${file.name} · ${firstSheet}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The coordinator file could not be read.");
    } finally {
      setIsReadingFile(false);
    }
  }, [processMatrix]);

  const buildPreview = () => {
    if (!sourceMatrix.length) return toast.error("Upload a coordinator file or paste a spreadsheet grid first.");
    const generated = buildCoordinatorImport(sourceMatrix, centers, leagueCode, eventCode);
    setResult(generated);
  };

  const downloadWorkbook = () => {
    if (!result) return;
    const workbook = XLSX.utils.book_new();
    const masterRows = [
      [...MASTER_PASTE_HEADERS],
      ...result.masterRows.map((row) => MASTER_PASTE_HEADERS.map((header) => row[header] ?? "")),
    ];
    const rawHeaders = Array.from(new Set(result.errorRows.flatMap((row) => Object.keys(row.raw))));
    const errorsRows = [
      ["Source Row", "Reason", ...rawHeaders],
      ...result.errorRows.map((row) => [row.sourceRow, row.reason, ...rawHeaders.map((header) => row.raw[header] ?? "")]),
    ];
    const summaryRows = [
      ["Metric", "Count"],
      ["New", result.summary.new],
      ["Merged 2nd Squad", result.summary.mergedSecondSquad],
      ["Error", result.summary.error],
    ];
    const masterSheet = XLSX.utils.aoa_to_sheet(masterRows);
    masterSheet["!cols"] = MASTER_PASTE_HEADERS.map((header) => ({ wch: Math.min(Math.max(header.length + 2, 12), 32) }));
    const errorsSheet = XLSX.utils.aoa_to_sheet(errorsRows);
    errorsSheet["!cols"] = [{ wch: 12 }, { wch: 44 }, ...rawHeaders.map(() => ({ wch: 22 }))];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet["!cols"] = [{ wch: 24 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, masterSheet, "MASTER_PASTE");
    XLSX.utils.book_append_sheet(workbook, errorsSheet, "ERRORS");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "SUMMARY");
    XLSX.writeFile(workbook, `MASTER_PASTE_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (ownerLoading || staffAccessQuery.isLoading || legacyAccessQuery.isLoading) {
    return <div className="min-h-screen grid place-items-center bg-[#070d16] text-slate-300">Checking secure Event Director access…</div>;
  }
  if (!hasAccess) {
    return <div className="min-h-screen grid place-items-center bg-[#070d16] px-6 text-center text-slate-300"><div><LockKeyhole className="mx-auto mb-3 h-7 w-7 text-amber-300" /><p className="font-semibold text-white">Event Director sign-in required</p><p className="mt-1 text-sm">Returning to the secure portal…</p></div></div>;
  }

  return (
    <main className="min-h-screen bg-[#070d16] pb-16 text-slate-100">
      <header className="border-b border-cyan-300/15 bg-[#0b1322]/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button onClick={() => setLocation("/ed")} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"><ArrowLeft className="h-4 w-4" />Event Director</button>
          <span className="hidden h-5 w-px bg-white/10 sm:block" />
          <div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">Coordinator File Tools</p><h1 className="text-xl font-black tracking-wide text-white">Coordinator Import</h1></div>
          <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200"><LockKeyhole className="h-3.5 w-3.5" />No app or Google Sheet writes</div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 md:px-6">
        <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.10] via-slate-950 to-violet-500/[0.08] p-5 shadow-2xl shadow-black/20">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Review, normalize, then download</p><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Create a clean MASTER_PASTE workbook.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Upload a coordinator’s Excel or CSV file, or paste a spreadsheet grid. This tool detects approved aliases, validates center codes, merges two squads, and creates an Excel workbook ready for value-only paste into the selected master sheet tab.</p></div>
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm"><p className="font-bold text-amber-200">Safeguard</p><p className="mt-1 leading-5 text-slate-300">This workflow does not import bowlers, create QR codes, change door data, create accounts, or write to Google Sheets. Review the preview before downloading.</p></div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-5"><div className="flex items-center gap-2"><TableProperties className="h-5 w-5 text-amber-300" /><h2 className="font-bold text-white">ID settings</h2></div><p className="mt-2 text-sm leading-5 text-slate-400">The established 10-digit identifier is used: <span className="font-mono text-slate-200">CC + LL + EE + TT + BB</span>.</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-300">League code<input inputMode="numeric" maxLength={2} value={leagueCode} onChange={(event) => setLeagueCode(event.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="e.g. 03" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#111b2d] px-3 py-2 text-base text-white outline-none ring-cyan-400/30 transition focus:ring-2" /></label><label className="text-xs font-semibold text-slate-300">Event code<input inputMode="numeric" maxLength={2} value={eventCode} onChange={(event) => setEventCode(event.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="e.g. 01" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#111b2d] px-3 py-2 text-base text-white outline-none ring-cyan-400/30 transition focus:ring-2" /></label></div><p className="mt-3 text-xs leading-5 text-slate-500">Center, team number, bowler position, and a known center code must also be available. The tool never invents a code.</p></div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-5"><div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-cyan-300" /><h2 className="font-bold text-white">Coordinator source</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={() => fileInputRef.current?.click()} className="group rounded-xl border border-dashed border-cyan-300/35 bg-cyan-400/[0.06] p-4 text-left transition hover:border-cyan-300/70 hover:bg-cyan-400/[0.1]"><FileUp className="h-6 w-6 text-cyan-300" /><p className="mt-3 font-bold text-white">Upload Excel or CSV</p><p className="mt-1 text-xs leading-5 text-slate-400">Reads the first worksheet in an XLSX file.</p></button><button onClick={() => processMatrix(matrixFromPastedGrid(pasteText), "Pasted spreadsheet grid")} disabled={!pasteText.trim()} className="rounded-xl border border-dashed border-violet-300/35 bg-violet-400/[0.06] p-4 text-left transition hover:border-violet-300/70 hover:bg-violet-400/[0.1] disabled:cursor-not-allowed disabled:opacity-45"><Upload className="h-6 w-6 text-violet-300" /><p className="mt-3 font-bold text-white">Process pasted grid</p><p className="mt-1 text-xs leading-5 text-slate-400">Paste with the header row from a spreadsheet.</p></button></div><input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ""; }} /><textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={4} placeholder={"First Name\tLast Name\tCenter\tTeam #\tPosition\n…"} className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-[#111b2d] p-3 font-mono text-xs text-slate-200 outline-none ring-violet-400/30 transition focus:ring-2" /></div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/65 p-5"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-bold text-white">Preview before export</h2><p className="mt-1 text-sm text-slate-400">{sourceName ? `${sourceName} · ${Math.max(sourceMatrix.length - 1, 0)} source row(s)` : "Choose a source to begin."}</p></div><button onClick={buildPreview} disabled={!sourceMatrix.length || isReadingFile || centersQuery.isLoading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><TableProperties className="h-4 w-4" />{isReadingFile ? "Reading file…" : "Build preview"}</button></div>{sourceHeaders.length > 0 && <div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Detected headers</p><div className="mt-2 flex flex-wrap gap-1.5">{sourceHeaders.map((header) => <span key={header} className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-xs text-slate-300">{header || "(blank)"}</span>)}</div></div>}</section>

        {result && <section className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">Parsed master rows</p><p className="mt-1 text-3xl font-black text-white">{result.masterRows.length}</p></div><div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.08] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">Merged 2nd squad</p><p className="mt-1 text-3xl font-black text-white">{result.summary.mergedSecondSquad}</p></div><div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-200">Errors to correct</p><p className="mt-1 text-3xl font-black text-white">{result.errorRows.length}</p></div></div><div className="overflow-hidden rounded-2xl border border-rose-400/25 bg-rose-500/[0.045]"><div className="border-b border-rose-400/15 p-5"><h2 className="font-bold text-rose-100">Errors — excluded from MASTER_PASTE</h2><p className="mt-1 text-sm text-rose-100/70">Correct these source rows and build the preview again. Every error will also be included in the downloaded ERRORS tab.</p></div>{result.errorRows.length ? <div className="max-h-80 overflow-auto"><table className="w-full min-w-[630px] text-left text-sm"><thead className="sticky top-0 bg-[#25121b] text-[11px] uppercase tracking-[0.12em] text-rose-200"><tr><th className="px-4 py-3">Source row</th><th className="px-4 py-3">Bowler / center</th><th className="px-4 py-3">Reason</th></tr></thead><tbody>{result.errorRows.map((row) => <tr key={`${row.sourceRow}-${row.reason}`} className="border-t border-rose-300/10"><td className="px-4 py-3 font-mono text-rose-100/75">{row.sourceRow}</td><td className="px-4 py-3 text-slate-200">{row.raw["First Name"] || row.raw.First || "Unknown"} {row.raw["Last Name"] || row.raw.Last || ""}<span className="block text-xs text-slate-400">{row.raw.Center || row.raw["Bowling Center"] || "Center not provided"}</span></td><td className="px-4 py-3 text-rose-100">{row.reason}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-emerald-200">No errors found. Every parsed row is ready for MASTER_PASTE.</p>}</div><div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/65"><div className="flex flex-wrap items-center gap-4 border-b border-white/10 p-5"><div className="min-w-0 flex-1"><h2 className="font-bold text-white">Parsed MASTER_PASTE rows</h2><p className="mt-1 text-sm text-slate-400">Review these rows before downloading. Protected QR, entry, survey, guest, claim, billing, and score fields stay blank.</p></div><button onClick={downloadWorkbook} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/15 transition hover:brightness-110"><Download className="h-4 w-4" />Download final Excel file</button></div>{result.masterRows.length ? <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 bg-[#0d1729] text-[11px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-4 py-3">Bowler ID</th><th className="px-4 py-3">Bowler</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Center / team</th><th className="px-4 py-3">Primary squad</th><th className="px-4 py-3">Second squad</th></tr></thead><tbody>{result.masterRows.map((row) => <tr key={row["Bowler ID"]} className="border-t border-white/[0.06]"><td className="px-4 py-3 font-mono text-xs text-cyan-200">{row["Bowler ID"]}</td><td className="px-4 py-3 font-semibold text-white">{row["First Name"]} {row["Last Name"]}<span className="block text-xs font-normal text-slate-500">{row["T-Shirt Size"] ? `Shirt: ${row["T-Shirt Size"]}` : "No shirt size"}</span></td><td className="px-4 py-3 text-slate-300">{row.Email || "—"}<span className="block text-xs text-slate-500">{row.Phone || "No phone"}</span></td><td className="px-4 py-3 text-slate-300">{row.Center || "—"}<span className="block text-xs text-slate-500">Team {row["Team #"] || "—"} · {row["Team Name"] || "No team name"}</span></td><td className="px-4 py-3 text-slate-300">{row["Squad Day & Time"] || "—"}<span className="block text-xs text-slate-500">Lane {row["Lane #"] || "—"}</span></td><td className="px-4 py-3 text-slate-300">{row["2nd Squad Time"] || "—"}<span className="block text-xs text-slate-500">{row["2nd Lane #"] ? `Lane ${row["2nd Lane #"]}` : ""}</span></td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-400">No parsed rows are ready for export until the listed errors are corrected.</p>}</div></section>}
      </div>
    </main>
  );
}
