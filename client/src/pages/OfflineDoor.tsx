/**
 * OfflineDoor — single-laptop, offline-first door scanner page.
 *
 * Three views, chosen from the top bar:
 *   • Console  — the laptop control + resolution + reentry station (default)
 *   • Window A — fullscreen scan view for TV #1 (one scanner)
 *   • Window B — fullscreen scan view for TV #2 (one scanner)
 *
 * Real-world setup: use the Console to open Scanner A and Scanner B as two
 * station-specific browser windows, then place one window on each monitor. Both
 * windows share the same IndexedDB, so a pass used at either station is instantly
 * dead everywhere. Each station keeps its own verification flash and result display.
 *
 * A keyboard-wedge USB scanner sends keystrokes to the focused operating-system
 * window. For two scanners on one Pi, use devices with distinct serial/evdev
 * routing or use one scanner host per station; two ordinary keyboard-wedge scanners
 * cannot be distinguished by browser JavaScript alone.
 */
import { useEffect, useState } from "react";
import { ScanLane } from "@/components/door/ScanLane";
import { DoorConsole } from "@/components/door/DoorConsole";
import { Button } from "@/components/ui/button";
import { startSyncService } from "@/lib/offlineDoorSync";
import { getMeta, type ReentryZone } from "@/lib/offlineDoorDb";
import { buildOfflineDoorStationUrl, isOfflineDoorDatasetForEvent, resolveOfflineDoorEventId, resolveOfflineDoorView, type OfflineDoorView } from "@/lib/offlineDoorNavigation";

type View = OfflineDoorView;

export default function OfflineDoor() {
  const [view, setView] = useState<View>(() => resolveOfflineDoorView(window.location.search));
  const [eventId] = useState<number>(() => {
    return resolveOfflineDoorEventId(
      window.location.search,
      localStorage.getItem("vsn_selected_event_id")
    );
  });
  const [hasData, setHasData] = useState(false);

  // Per-window reentry zone assignment (which door this TV covers).
  const [zoneA, setZoneA] = useState<ReentryZone>("N");
  const [zoneB, setZoneB] = useState<ReentryZone>("E");

  // Per-window station mode (banquet or pool).
  const [stationA, setStationA] = useState<"banquet" | "pool">("banquet");
  const [stationB, setStationB] = useState<"banquet" | "pool">("pool");

  const openStationWindow = (station: "A" | "B") => {
    const url = buildOfflineDoorStationUrl(window.location.origin, eventId, station);
    const popup = window.open(url, `bowl-vegas-scanner-${station}`, "popup,width=1280,height=800");
    if (!popup) window.location.assign(url);
  };

  useEffect(() => {
    startSyncService();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await getMeta();
      if (alive) setHasData(isOfflineDoorDatasetForEvent(meta, eventId));
    })();
    const t = setInterval(async () => {
      const meta = await getMeta();
      if (alive) setHasData(isOfflineDoorDatasetForEvent(meta, eventId));
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
              {label} — dedicated scanner display · Event {eventId} · Zone {zone}
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
              <div className="text-2xl font-semibold">No data loaded for Event ID {eventId}</div>
              <div className="mt-2 text-slate-500">Go to the Console and load Banquet or Pool Party data for this event before scanning.</div>
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
          <div><div className="text-xl font-bold">Offline Door Scanner</div><p className="mt-1 text-xs text-muted-foreground">Open Scanner A and Scanner B on separate monitors. Each station shows its own verification result while the event database prevents duplicate entry across both stations.</p></div>
          <div className="flex gap-2">
            <Button variant="default">Console</Button>
                          <Button variant="outline" onClick={() => openStationWindow("A")}>
                Open Scanner A (Monitor 1)
              </Button>
              <Button variant="outline" onClick={() => openStationWindow("B")}>
                Open Scanner B (Monitor 2)
              </Button>

          </div>
        </div>
      </div>
      <DoorConsole eventId={eventId} />
    </div>
  );
}
