/**
 * ScanLane — one scan panel. USB barcode/QR scanners act as keyboards that type
 * the code fast and press Enter. Each lane listens for input while focused/active,
 * runs the offline engine, and flashes green (admit) or red (deny) with a beep.
 *
 * Four of these tile across two TVs (2 per TV) for the single-laptop door setup.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { processScan, type ScanDecision } from "@/lib/offlineDoorEngine";
import type { ReentryZone } from "@/lib/offlineDoorDb";
import { cn } from "@/lib/utils";

interface ScanLaneProps {
  lane: number;
  label: string;
  zone: ReentryZone | null;
  /** When true this lane captures global keyboard input (for keyboard-wedge scanners). */
  captureKeyboard: boolean;
  onResult?: (d: ScanDecision) => void;
}

type FlashState = "idle" | "admit" | "deny";

// Simple WebAudio beeps (no asset files needed; works offline).
function beep(kind: "ok" | "bad") {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (kind === "ok") {
      osc.frequency.value = 880;
      gain.gain.value = 0.18;
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.type = "square";
      osc.frequency.value = 200;
      gain.gain.value = 0.22;
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
    osc.onended = () => ctx.close();
  } catch {
    /* audio not available — silent */
  }
}

export function ScanLane({ lane, label, zone, captureKeyboard, onResult }: ScanLaneProps) {
  const [flash, setFlash] = useState<FlashState>("idle");
  const [decision, setDecision] = useState<ScanDecision | null>(null);
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToken = useCallback(
    async (raw: string) => {
      const token = raw.trim();
      if (!token) return;
      const d = await processScan(token, { lane, zone });
      setDecision(d);
      setFlash(d.admit ? "admit" : "deny");
      beep(d.admit ? "ok" : "bad");
      onResult?.(d);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash("idle"), d.admit ? 2200 : 4000);
    },
    [lane, zone, onResult]
  );

  // Keyboard-wedge capture: accumulate fast keystrokes, submit on Enter.
  useEffect(() => {
    if (!captureKeyboard) return;
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in a real input/textarea (e.g., Console search).
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) &&
        target !== inputRef.current
      ) {
        return;
      }
      const now = Date.now();
      // Reset buffer if there was a long pause (human typing, not a scanner burst).
      if (now - lastKeyTimeRef.current > 120) bufferRef.current = "";
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (code) void handleToken(code);
        e.preventDefault();
        return;
      }
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureKeyboard, handleToken]);

  return (
    <div
      className={cn(
        "door-lane relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-4 transition-colors duration-200",
        flash === "idle" && "border-slate-700 bg-slate-900",
        flash === "admit" && "border-emerald-400 bg-emerald-600",
        flash === "deny" && "border-red-400 bg-red-600"
      )}
    >
      {/* Lane label */}
      <div className="absolute left-4 top-3 rounded-full bg-black/40 px-4 py-1 text-lg font-bold tracking-wide text-white">
        {label}
        {zone && <span className="ml-2 rounded bg-white/20 px-2 py-0.5 text-sm">Zone {zone}</span>}
      </div>

      {/* Manual entry fallback (kept tiny; scanners use keyboard capture) */}
      {!captureKeyboard && (
        <input
          ref={inputRef}
          className="absolute right-3 top-3 w-40 rounded bg-black/30 px-2 py-1 text-sm text-white placeholder-white/50 outline-none"
          placeholder="manual code…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleToken((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = "";
            }
          }}
        />
      )}

      {/* Center status */}
      <div className="flex flex-col items-center px-6 text-center">
        {flash === "idle" && (
          <>
            <div className="text-3xl font-semibold text-slate-300">Ready to Scan</div>
            <div className="mt-2 text-base text-slate-500">{label}</div>
          </>
        )}
        {flash !== "idle" && decision && (
          <>
            <div className="text-6xl font-black uppercase tracking-tight text-white drop-shadow">
              {decision.headline}
            </div>
            <div className="mt-3 max-w-[90%] text-2xl font-medium text-white/95">{decision.detail}</div>
            {!decision.admit && (
              <div className="mt-4 rounded-lg bg-black/30 px-4 py-2 text-lg font-semibold text-white">
                Ask guest to STEP ASIDE → resolve at laptop
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
