/**
 * UploadScanLogModal
 *
 * Allows the Event Director to upload the JSON scan log produced by the
 * offline scanner HTML bundle. Parses the file (or pasted JSON), shows a
 * preview of what will be synced, then calls offlineDoor.sync to write all
 * offline admits to the database and Google Sheet.
 */
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ScanResult = "admitted" | "denied_used" | "denied_notfound" | "override_admitted" | "reentry_admitted" | "denied_wrongzone";

interface ScanEntry {
  token: string;
  result: ScanResult;
  reason?: string | null;
  lane?: number | null;
  scannedAtMs: number;
  overrideBy?: string | null;
  wristbandNumber?: string | null;
  edFlagged?: boolean;
}

interface ScanLogPayload {
  eventId: number;
  mode: "banquet" | "pool";
  generatedAt?: string;
  scans: ScanEntry[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const VALID_RESULTS = new Set([
  "admitted",
  "denied_used",
  "denied_notfound",
  "override_admitted",
  "reentry_admitted",
  "denied_wrongzone",
]);

export function UploadScanLogModal({ open, onClose }: Props) {
  const [parsed, setParsed] = useState<ScanLogPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [synced, setSynced] = useState<{
    inserted: number;
    duplicates: number;
    marked: number;
    flagged: number;
    errors: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const syncMut = trpc.offlineDoor.sync.useMutation({
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  const reset = () => {
    setParsed(null);
    setParseError(null);
    setPasteText("");
    setSynced(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseJSON = useCallback((raw: string) => {
    setParseError(null);
    setSynced(null);
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (typeof obj.eventId !== "number") throw new Error("Missing or invalid eventId");
      if (obj.mode !== "banquet" && obj.mode !== "pool") throw new Error("mode must be 'banquet' or 'pool'");
      if (!Array.isArray(obj.scans)) throw new Error("scans must be an array");

      // Filter to only scans with valid result types; warn about unknowns
      const validScans: ScanEntry[] = [];
      let skipped = 0;
      for (const s of obj.scans as Record<string, unknown>[]) {
        if (typeof s.token !== "string" || typeof s.scannedAtMs !== "number") { skipped++; continue; }
        if (!VALID_RESULTS.has(String(s.result))) { skipped++; continue; }
        validScans.push({
          token: s.token,
          result: s.result as ScanResult,
          reason: (s.reason as string | null) ?? null,
          lane: (s.lane as number | null) ?? null,
          scannedAtMs: s.scannedAtMs as number,
          overrideBy: (s.overrideBy as string | null) ?? null,
          wristbandNumber: (s.wristbandNumber as string | null) ?? null,
          edFlagged: Boolean(s.edFlagged),
        });
      }
      if (skipped > 0) toast.warning(`${skipped} scan entries skipped (invalid format or unknown result type)`);

      setParsed({
        eventId: obj.eventId as number,
        mode: obj.mode as "banquet" | "pool",
        generatedAt: (obj.generatedAt as string) ?? undefined,
        scans: validScans,
      });
    } catch (e) {
      setParseError((e as Error).message);
      setParsed(null);
    }
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPasteText(text);
      parseJSON(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSync = async () => {
    if (!parsed) return;
    const toastId = toast.loading(`Syncing ${parsed.scans.length} scans to database…`);
    try {
      const res = await syncMut.mutateAsync({
        eventId: parsed.eventId,
        mode: parsed.mode,
        deviceId: "offline-bundle-upload",
        scans: parsed.scans,
        reentryEvents: [],
      });
      setSynced(res);
      const msg = `Sync complete — ${res.inserted} new, ${res.duplicates} duplicates, ${res.marked} tokens marked used`;
      toast.success(msg, { id: toastId, duration: 8000 });
    } catch {
      toast.dismiss(toastId);
    }
  };

  // Stats for preview
  const admitCount = parsed?.scans.filter((s) => s.result === "admitted" || s.result === "override_admitted" || s.result === "reentry_admitted").length ?? 0;
  const deniedCount = parsed?.scans.filter((s) => s.result === "denied_used" || s.result === "denied_notfound" || s.result === "denied_wrongzone").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-[#1a1a1a] border-cyan-500/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-cyan-400 text-lg">📤 Upload Offline Scan Log</DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Upload the JSON scan log downloaded from the offline scanner HTML file. All admits will be written to the database and Google Sheet. Duplicate scans are automatically skipped.
          </DialogDescription>
        </DialogHeader>

        {!synced ? (
          <div className="space-y-4 mt-2">
            {/* Drop zone / file picker */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-cyan-400 bg-cyan-500/10" : "border-white/20 hover:border-cyan-500/50 hover:bg-white/5"
              }`}
            >
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm font-semibold text-gray-300">Drop scan log JSON here, or click to browse</p>
              <p className="text-xs text-gray-500 mt-1">File name: vsn-scan-log-*.json</p>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {/* Or paste */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Or paste JSON directly:</p>
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); if (e.target.value.trim()) parseJSON(e.target.value); else { setParsed(null); setParseError(null); } }}
                placeholder='{"eventId": 1, "mode": "banquet", "scans": [...]}'
                className="w-full h-28 bg-[#111] border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            {/* Parse error */}
            {parseError && (
              <div className="bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-3 text-sm text-red-300">
                ⚠️ Parse error: {parseError}
              </div>
            )}

            {/* Preview */}
            {parsed && (
              <div className="bg-[#111] border border-cyan-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-cyan-300">Preview</span>
                  <Badge className="bg-cyan-900 text-cyan-300 border-0">Event {parsed.eventId}</Badge>
                  <Badge className={parsed.mode === "banquet" ? "bg-purple-900 text-purple-300 border-0" : "bg-blue-900 text-blue-300 border-0"}>
                    {parsed.mode === "banquet" ? "🍽️ Banquet" : "🏊 Pool Party"}
                  </Badge>
                  {parsed.generatedAt && (
                    <span className="text-xs text-gray-500">Generated {new Date(parsed.generatedAt).toLocaleString()}</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-white">{parsed.scans.length}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Total Scans</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-green-400">{admitCount}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Admits</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-amber-400">{deniedCount}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Denied</div>
                  </div>
                </div>

                {/* Sample rows */}
                <div>
                  <p className="text-xs text-gray-500 mb-2">First 5 scans:</p>
                  <div className="space-y-1">
                    {parsed.scans.slice(0, 5).map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                          s.result === "admitted" || s.result === "override_admitted" || s.result === "reentry_admitted"
                            ? "bg-green-900 text-green-300"
                            : s.result === "denied_used"
                            ? "bg-amber-900 text-amber-300"
                            : "bg-red-900 text-red-300"
                        }`}>{s.result.toUpperCase()}</span>
                        <span className="text-gray-400 font-mono truncate max-w-[180px]">{s.token}</span>
                        <span className="text-gray-600 ml-auto">{new Date(s.scannedAtMs).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {parsed.scans.length > 5 && (
                      <p className="text-xs text-gray-600">…and {parsed.scans.length - 5} more</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    onClick={handleSync}
                    disabled={syncMut.isPending}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                  >
                    {syncMut.isPending ? "Syncing…" : `✅ Sync ${parsed.scans.length} Scans to Database`}
                  </Button>
                  <Button variant="outline" onClick={reset} className="border-white/20 text-gray-300">
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Success screen */
          <div className="space-y-4 mt-2">
            <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-5 text-center">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-lg font-bold text-green-300 mb-1">Sync Complete</h3>
              <p className="text-sm text-gray-400">All offline scans have been written to the database and Google Sheet.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#111] rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-green-400">{synced.inserted}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">New Scans Inserted</div>
              </div>
              <div className="bg-[#111] rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-amber-400">{synced.duplicates}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Duplicates Skipped</div>
              </div>
              <div className="bg-[#111] rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-cyan-400">{synced.marked}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Tokens Marked Used</div>
              </div>
              <div className="bg-[#111] rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-purple-400">{synced.flagged}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">ED Flags</div>
              </div>
            </div>
            {synced.errors.length > 0 && (
              <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3">
                <p className="text-xs font-bold text-red-300 mb-1">{synced.errors.length} errors (non-fatal):</p>
                {synced.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-400 font-mono">{e}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={reset} variant="outline" className="border-white/20 text-gray-300">
                Upload Another Log
              </Button>
              <Button onClick={handleClose} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
