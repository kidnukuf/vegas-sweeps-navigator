/**
 * ScanResult — full-screen overlay for scanner TV windows.
 *
 * Four states:
 * - Used QR: black screen + large X across entire screen
 * - Pool match: light blue background + huge centered white "21" or red "00"
 * - Banquet match: light green background + huge centered white "21" or red "00"
 * - Mismatch: clear on-screen message
 *
 * Each state includes a synchronized full-screen color flash that plays with the sound:
 * - 21+ entry: Bright green flash
 * - Under-21 entry: Orange/amber flash
 * - Wrong event: Red flash
 * - Already used: Purple/magenta flash
 *
 * Designed for TV display with high-contrast, large text suitable for 10+ feet viewing.
 */
import { cn } from "@/lib/utils";

export type ScanResultState = "used" | "pool" | "banquet" | "mismatch";

export interface ScanResultProps {
  state: ScanResultState;
  /** For pool/banquet: "21" for adult or "00" for under-21 */
  ageCode?: "21" | "00";
  /** For mismatch: error message to display */
  message?: string;
  /** Optional: show result for this duration (ms), then hide */
  duration?: number;
  /** Called when result should be hidden (after duration expires) */
  onDismiss?: () => void;
  /** Optional: flash color overlay class to animate on mount */
  flashClass?: string;
}

export function ScanResult({ state, ageCode = "21", message, duration, onDismiss, flashClass }: ScanResultProps) {
  // Auto-dismiss after duration
  if (duration && onDismiss) {
    setTimeout(onDismiss, duration);
  }

  // Flash overlay element (animated color flash behind main content)
  const flashOverlay = flashClass ? (
    <div
      className={`fixed inset-0 z-40 ${flashClass}`}
      aria-hidden="true"
    />
  ) : null;

  // Used QR: black screen + large X
  if (state === "used") {
    return (
      <>
        {flashOverlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          {/* Large X across screen */}
          <div className="relative h-full w-full">
            {/* Diagonal line 1 */}
            <div
              className="absolute left-0 top-0 h-full w-full"
              style={{
                background: "linear-gradient(45deg, transparent 48%, white 48%, white 52%, transparent 52%)",
              }}
            />
            {/* Diagonal line 2 */}
            <div
              className="absolute left-0 top-0 h-full w-full"
              style={{
                background: "linear-gradient(-45deg, transparent 48%, white 48%, white 52%, transparent 52%)",
              }}
            />
          </div>
        </div>
      </>
    );
  }

  // Pool match: light blue background + age code
  if (state === "pool") {
    const isUnder21 = ageCode === "00";
    return (
      <>
        {flashOverlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "#ADD8E6" }}>
          <div className="text-center">
            <div
              className={cn(
                "font-black tracking-tighter",
                isUnder21 ? "text-red-600" : "text-white"
              )}
              style={{ fontSize: "clamp(200px, 50vw, 600px)" }}
            >
              {ageCode}
            </div>
            <div className="mt-4 text-2xl font-bold text-slate-800">
              {isUnder21 ? "UNDER 21" : "21+"}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Banquet match: light green background + age code
  if (state === "banquet") {
    const isUnder21 = ageCode === "00";
    return (
      <>
        {flashOverlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "#90EE90" }}>
          <div className="text-center">
            <div
              className={cn(
                "font-black tracking-tighter",
                isUnder21 ? "text-red-600" : "text-white"
              )}
              style={{ fontSize: "clamp(200px, 50vw, 600px)" }}
            >
              {ageCode}
            </div>
            <div className="mt-4 text-2xl font-bold text-slate-800">
              {isUnder21 ? "UNDER 21" : "21+"}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Mismatch: clear error message
  if (state === "mismatch") {
    return (
      <>
        {flashOverlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-600">
          <div className="text-center px-8">
            <div className="text-6xl font-black text-white mb-6">⚠️</div>
            <div className="text-5xl font-black text-white mb-4">WRONG EVENT</div>
            <div className="text-3xl font-semibold text-white/90">
              {message || "This QR does not match this station"}
            </div>
            <div className="mt-8 text-2xl font-bold text-white/80">
              Ask guest to STEP ASIDE
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}
