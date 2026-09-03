import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type HotelRoomPlannerProps = {
  eventId: number;
  sheetTabOverride?: string;
  hasSheetTarget: boolean;
};

const statusLabel: Record<string, string> = {
  shared_bowler: "Shared bowlers",
  guest_roommate: "Overnight guest",
  solo: "Solo room",
  ambiguous_solo: "Solo — review name",
};

const statusClass: Record<string, string> = {
  shared_bowler: "bg-cyan-950/50 border-cyan-500/30 text-cyan-200",
  guest_roommate: "bg-violet-950/50 border-violet-500/30 text-violet-200",
  solo: "bg-slate-900 border-slate-600 text-slate-200",
  ambiguous_solo: "bg-amber-950/50 border-amber-500/30 text-amber-200",
};

export default function HotelRoomPlanner({ eventId, sheetTabOverride, hasSheetTarget }: HotelRoomPlannerProps) {
  const [previewRequested, setPreviewRequested] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [showAssignments, setShowAssignments] = useState(false);
  const previewInput = useMemo(
    () => ({ eventId, sheetTabOverride: sheetTabOverride || undefined }),
    [eventId, sheetTabOverride],
  );
  const preview = trpc.masterSheet.previewHotelRoomIds.useQuery(previewInput, { enabled: previewRequested, staleTime: 0 });
  const apply = trpc.masterSheet.applyHotelRoomIds.useMutation({
    onSuccess: (result) => {
      toast.success(`Hotel Room ID written to ${result.sheetName}: ${result.assignedRows} bowlers · ${result.uniqueRooms} rooms.`);
      setConfirmation("");
      preview.refetch();
    },
    onError: (error) => toast.error(error.message ?? "Hotel Room ID write failed."),
  });

  const requestPreview = () => {
    if (!hasSheetTarget) {
      toast.error("No Google Sheet tab is configured for this event. Set it in Event Settings first.");
      return;
    }
    setPreviewRequested(true);
    void preview.refetch();
  };

  const writePlan = () => {
    if (!preview.data?.sourceHash) return;
    if (confirmation !== "APPLY") {
      toast.error('Type APPLY to confirm this selected-tab write-back.');
      return;
    }
    if (!window.confirm(`Write ${preview.data.summary.rosterRows} Hotel Room IDs to ${preview.data.sheetName}? Existing app-generated fields will not change.`)) return;
    apply.mutate({
      ...previewInput,
      sourceHash: preview.data.sourceHash,
      confirmation: "APPLY",
    });
  };

  const data = preview.data;
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-fuchsia-400/25 bg-[#100c1f]/90 p-4 shadow-inner shadow-fuchsia-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Hotel room planning</p>
          <h3 className="mt-1 text-base font-semibold text-white">Shared room IDs and reservation total</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">
            The planner reads the selected sheet tab’s roommate names. Exact unique bowler matches share one numeric ID. A complete name not found in the roster receives a <span className="font-mono text-violet-300">G</span> suffix for an overnight guest. Missing, placeholder, and ambiguous names receive an individual room number rather than being joined incorrectly. Banquet and pool guests are not treated as hotel guests automatically.
          </p>
        </div>
        <Button onClick={requestPreview} disabled={preview.isFetching || !hasSheetTarget} className="w-full shrink-0 bg-fuchsia-700 hover:bg-fuchsia-600 sm:w-auto">
          {preview.isFetching ? "Reviewing rooms…" : "Review Hotel Rooms"}
        </Button>
      </div>

      {preview.error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">{preview.error.message}</div>}

      {data && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Bowlers", data.summary.rosterRows, "text-white"],
              ["Rooms to reserve", data.summary.uniqueRooms, "text-fuchsia-200"],
              ["Shared rooms", data.summary.sharedBowlerRooms, "text-cyan-200"],
              ["Guest rooms", data.summary.guestRooms, "text-violet-200"],
              ["Solo rooms", data.summary.soloRooms, "text-slate-200"],
              ["Review names", data.summary.ambiguousSoloRows, "text-amber-200"],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
                <p className={`mt-1 text-xl font-black ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-fuchsia-500/20 bg-black/25 p-3 text-xs text-gray-300">
            <span className="font-semibold text-fuchsia-200">Selected target:</span> <span className="font-mono text-white">{data.sheetName}</span>. {data.existingRoomIdColumn ? "The existing Hotel Room ID column will be refreshed." : "Hotel Room ID will be appended after the existing last column."}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => setShowAssignments((value) => !value)} className="border-white/20 text-gray-100 hover:bg-white/10">
              {showAssignments ? "Hide assignment detail" : `View ${data.assignments.length} assignments`}
            </Button>
            <p className="text-xs text-gray-500">Correct a roommate relationship in the selected sheet tab, then review again before writing.</p>
          </div>

          {showAssignments && (
            <div className="max-h-80 overflow-auto rounded-lg border border-white/10">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#191127] text-[10px] uppercase tracking-wide text-gray-400">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Bowler</th><th className="px-3 py-2">Room ID</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Roommate entry</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-[#09070f]">
                  {data.assignments.map((assignment) => (
                    <tr key={assignment.rowNumber}>
                      <td className="px-3 py-2 text-gray-500">{assignment.rowNumber}</td>
                      <td className="px-3 py-2 font-medium text-white">{assignment.fullName}</td>
                      <td className="px-3 py-2 font-mono font-bold text-fuchsia-200">{assignment.roomId}</td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${statusClass[assignment.status]}`}>{statusLabel[assignment.status]}</span></td>
                      <td className="px-3 py-2 text-gray-400">{assignment.roommateName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/20 p-4">
            <p className="text-sm font-semibold text-white">Write the reviewed room plan</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">Only an authenticated Event Director with access to this event can write. The current selected tab is re-read immediately before writing; if it changed since this preview, the write is blocked until you review again.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder='Type APPLY to enable write-back' className="border-white/15 bg-black/40 text-white placeholder:text-gray-600 sm:max-w-xs" />
              <Button onClick={writePlan} disabled={apply.isPending || confirmation !== "APPLY"} className="bg-fuchsia-700 hover:bg-fuchsia-600">
                {apply.isPending ? "Writing room IDs…" : "Write Hotel Room IDs"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
