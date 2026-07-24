/**
 * EDBowlerView — renders the exact BowlerDashboard the bowler sees,
 * with an ED amber banner + inline ✏️ edit buttons baked in.
 * Opened by clicking any scantronId in the AdminDashboard.
 */
import BowlerDashboard from "@/pages/BowlerDashboard";
import { Button } from "@/components/ui/button";

interface EDBowlerViewProps {
  bowlerId: number | null;
  onClose: () => void;
}

export default function EDBowlerView({ bowlerId, onClose }: EDBowlerViewProps) {
  if (bowlerId == null) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Close bar */}
      <div className="flex items-center justify-between bg-zinc-900 border-b border-amber-500/30 px-4 py-2 shrink-0">
        <span className="text-amber-400 font-bold text-sm tracking-wide">
          🔑 ED Impersonation View — Bowler Portal
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="text-white/70 hover:text-white"
          onClick={onClose}
        >
          ✕ Close
        </Button>
      </div>

      {/* Scrollable bowler portal — identical to what the bowler sees */}
      <div className="flex-1 overflow-y-auto">
        <BowlerDashboard edBowlerId={bowlerId} />
      </div>
    </div>
  );
}
