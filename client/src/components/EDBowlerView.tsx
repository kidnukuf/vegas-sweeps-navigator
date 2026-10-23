/**
 * EDBowlerView — renders the exact BowlerDashboard the bowler sees,
 * with an ED amber banner + inline ✏️ edit buttons baked in.
 * Opened by clicking any scantronId in the AdminDashboard.
 */
import BowlerDashboard from "@/pages/BowlerDashboard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EDBowlerViewProps {
  bowlerId: number | null;
  onClose: () => void;
}

export default function EDBowlerView({ bowlerId, onClose }: EDBowlerViewProps) {
  const open = bowlerId !== null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[calc(var(--app-viewport-height)-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-xl border border-amber-500/30 bg-black p-0 text-white sm:h-[calc(var(--app-viewport-height)-2rem)]"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-amber-500/30 bg-zinc-900 px-4 py-2 text-left">
          <div>
            <DialogTitle className="text-sm font-bold tracking-wide text-amber-400">
              🔑 ED Impersonation View — Bowler Portal
            </DialogTitle>
            <DialogDescription className="sr-only">
              Event Director preview and editing view of the selected bowler&apos;s portal.
            </DialogDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-white/70 hover:text-white"
            onClick={onClose}
          >
            ✕ Close
          </Button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {bowlerId !== null && <BowlerDashboard edBowlerId={bowlerId} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
