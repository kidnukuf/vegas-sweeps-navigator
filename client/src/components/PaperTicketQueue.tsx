import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type BowlerOption = {
  id?: unknown;
  legalFirstName?: unknown;
  legalLastName?: unknown;
  centerName?: unknown;
  teamName?: unknown;
};

type SelectableBowler = { id: number; legalFirstName: string; legalLastName: string; centerName: string; teamName: string };
type PaperStatus = "requested" | "ready" | "delivered" | "restored";

const NEXT_STATUSES: Record<PaperStatus, PaperStatus[]> = {
  requested: ["requested", "ready", "restored"],
  ready: ["ready", "delivered", "restored"],
  delivered: ["delivered", "restored"],
  restored: ["restored", "requested"],
};

export default function PaperTicketQueue({ eventId, bowlers }: { eventId: number; bowlers: BowlerOption[] }) {
  const utils = trpc.useUtils();
  const [selectedBowlerId, setSelectedBowlerId] = useState("");
  const [note, setNote] = useState("");
  const { data: requests = [], isLoading } = trpc.claimAccess.paperTickets.listForEvent.useQuery({ eventId });
  const create = trpc.claimAccess.paperTickets.createForBowler.useMutation({
    onSuccess: () => {
      toast.success("Paper-ticket request added. Digital passes remain unchanged.");
      setSelectedBowlerId("");
      setNote("");
      utils.claimAccess.paperTickets.listForEvent.invalidate({ eventId });
    },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.claimAccess.paperTickets.updateStatus.useMutation({
    onSuccess: () => utils.claimAccess.paperTickets.listForEvent.invalidate({ eventId }),
    onError: (error) => toast.error(error.message),
  });

  const requestedBowlerIds = useMemo(() => new Set(requests.map((request) => request.bowlerId)), [requests]);
  const availableBowlers = useMemo<SelectableBowler[]>(() => bowlers
    .map((bowler) => ({
      id: Number(bowler.id),
      legalFirstName: String(bowler.legalFirstName ?? ""),
      legalLastName: String(bowler.legalLastName ?? ""),
      centerName: String(bowler.centerName ?? ""),
      teamName: String(bowler.teamName ?? ""),
    }))
    .filter((bowler) => Number.isSafeInteger(bowler.id) && bowler.id > 0 && !requestedBowlerIds.has(bowler.id)), [bowlers, requestedBowlerIds]);

  return (
    <section className="mt-6 rounded-2xl border border-amber-500/25 bg-[#1a1a1a] p-5 print:bg-white print:text-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300 print:text-amber-900">Alternative access</p><h2 className="mt-1 text-xl font-bold text-white print:text-black">Paper-ticket queue</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-400 print:text-gray-700">Create a manual record for bowlers who will receive a substitute with their team shirts. This workflow does not disable QR passes or redeem a claim code; use Passport Management separately if digital access must change.</p></div>
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/10 print:hidden">Print current queue</button>
      </div>
      <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] print:hidden">
        <select value={selectedBowlerId} onChange={(event) => setSelectedBowlerId(event.target.value)} className="rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white">
          <option value="">Select a bowler to add…</option>
          {availableBowlers.map((bowler) => <option key={bowler.id} value={bowler.id}>{bowler.legalLastName}, {bowler.legalFirstName} — {bowler.centerName ?? "No center"}{bowler.teamName ? ` / ${bowler.teamName}` : ""}</option>)}
        </select>
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Optional captain / shirt-distribution note" className="rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-gray-600" />
        <button type="button" disabled={!selectedBowlerId || create.isPending} onClick={() => create.mutate({ eventId, bowlerId: Number(selectedBowlerId), note: note.trim() || undefined })} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">{create.isPending ? "Adding…" : "Add paper ticket"}</button>
      </div>
      {isLoading ? <p className="mt-5 text-sm text-gray-500">Loading paper-ticket records…</p> : requests.length === 0 ? <p className="mt-5 text-sm text-gray-500">No paper-ticket records for this event.</p> : (
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500 print:text-gray-700"><th className="px-2 py-2">Bowler</th><th className="px-2 py-2">Center / Team</th><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Access status</th><th className="px-2 py-2">Note</th><th className="px-2 py-2 print:hidden">Update</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id} className="border-b border-white/5 text-gray-200 print:text-black"><td className="px-2 py-3 font-semibold">{request.legalFirstName} {request.legalLastName}</td><td className="px-2 py-3 text-gray-400 print:text-gray-700">{request.centerName ?? "—"}<br />{request.teamName ?? "—"}</td><td className="px-2 py-3 font-mono text-amber-200 print:text-black">{request.referenceCode}</td><td className="px-2 py-3 capitalize">{request.status}</td><td className="px-2 py-3 text-xs text-gray-400 print:text-gray-700">Pool: {request.hasDigitalPoolPass ? "active" : "none"}<br />Banquet: {request.hasDigitalBanquetPass ? "active" : "none"}</td><td className="px-2 py-3 text-gray-400 print:text-gray-700">{request.note || "—"}</td><td className="px-2 py-3 print:hidden"><select aria-label={`Update status for ${request.legalFirstName} ${request.legalLastName}`} value={request.status} onChange={(event) => update.mutate({ eventId, requestId: request.id, status: event.target.value as PaperStatus })} disabled={update.isPending} className="rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white">{NEXT_STATUSES[request.status].map((status) => <option key={status} value={status}>{status === "restored" ? "Restored digital" : status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}
