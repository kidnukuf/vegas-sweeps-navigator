/**
 * OfflineDoor — single-laptop, offline-first door scanner page.
 *
 * Three views, chosen from the top bar:
 *   • Console  — the laptop control + resolution + reentry station (default)
 *   • Window A — fullscreen scan view for TV #1 (one scanner)
 *   • Window B — fullscreen scan view for TV #2 (one scanner)
 *
 * Real-world setup: open this page in 2 browser windows, drag one to each TV,
 * press "Window A" on one and "Window B" on the other, then F11 to fullscreen.
 * Keep the Console on the laptop's own screen. All three share the same IndexedDB,
 * so a pass used on either TV is instantly dead everywhere.
 *
 * Only ONE scan window should capture the keyboard per physical machine window —
 * each opened browser window has its own keyboard focus, so one scanner → one window.
 */
import { useEffect, useState } from "react";
import { ScanLane } from "@/components/door/ScanLane";
import { DoorConsole } from "@/components/door/DoorConsole";
import { Button } from "@/components/ui/button";
import { startSyncService } from "@/lib/offlineDoorSync";
import { getMeta, type ReentryZone } from "@/lib/offlineDoorDb";

type View = "console" | "A" | "B";

export default function OfflineDoor() {
  const [view, setView] = useState<View>("console");
  const [eventId] = useState<number>(() => {
    const saved = Number(localStorage.getItem("vsn_selected_event_id"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const [hasData, setHasData] = useState(false);

  // Per-window reentry zone assignment (which door this TV covers).
  const [zoneA, setZoneA] = useState<ReentryZone>("N");
  const [zoneB, setZoneB] = useState<ReentryZone>("E");

  // Per-window station mode (banquet or pool).
  const [stationA, setStationA] = useState<"banquet" | "pool">("banquet");
  const [stationB, setStationB] = useState<"banquet" | "pool">("pool");

  useEffect(() => {
    startSyncService();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await getMeta();
      if (alive) setHasData(Boolean(meta));
    })();
    const t = setInterval(async () => {
      const meta = await getMeta();
      if (alive) setHasData(Boolean(meta));
    }, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Fullscreen scan window (one scanner captures keyboard here).
  if (view === "A" || view === "B") {
    const zone = view === "A" ? zoneA : zoneB;
    const label = view === "A" ? "Door A" : "Door B";
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setView("console")}>
              ← Console
            </Button>
            <span className="text-sm text-slate-400">
              {label} — one scanner only · Zone {zone}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-slate-500">Re-entry zone:</span>
            {(["N", "E", "S", "W"] as ReentryZone[]).map((z) => (
              <Button
                key={z}
                size="sm"
                variant={zone === z ? "default" : "outline"}
                className="h-7 w-7 p-0 text-xs"
                onClick={() => (view === "A" ? setZoneA(z) : setZoneB(z))}
              >
                {z}
              </Button>
            ))}
          </div>
        </div>
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center text-center text-slate-300">
            <div>
              <div className="text-2xl font-semibold">No data loaded</div>
              <div className="mt-2 text-slate-500">Go to the Console and load Banquet or Pool Party data first.</div>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            {/* One capturing lane fills the TV. */}
            <ScanLane
              lane={view === "A" ? 1 : 2}
              label={label}
              zone={zone}
              station={view === "A" ? stationA : stationB}
              captureKeyboard
            />
          </div>
        )}
      </div>
    );
  }

  // Console view
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-xl font-bold">Offline Door Scanner</div>
          <div className="flex gap-2">
            <Button variant="default">Console</Button>
            <Button variant="outline" onClick={() => setView("A")}>
              Open Door A (TV 1)
            </Button>
            <Button variant="outline" onClick={() => setView("B")}>
              Open Door B (TV 2)
            </Button>
          </div>
        </div>
      </div>
      <DoorConsole eventId={eventId} />
    </div>
  );
}
