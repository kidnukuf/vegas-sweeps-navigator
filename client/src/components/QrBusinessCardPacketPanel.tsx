import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadQrBusinessCards, printQrBusinessCards, type QrBusinessCardRecord } from "@/lib/qrBusinessCardsPdf";

type Props = { eventId: number; eventName?: string | null };

export default function QrBusinessCardPacketPanel({ eventId, eventName }: Props) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("vsn_ed_token") ?? "" : "";
  const rosterQuery = trpc.bowlerAuth.getQrBusinessCardRoster.useQuery(
    { token, eventId },
    { enabled: Boolean(token && eventId > 0), retry: false },
  );
  const records = useMemo<QrBusinessCardRecord[]>(() => (rosterQuery.data?.cards ?? []).map((card) => ({
    cardId: String(card.cardId),
    bowlerId: Number(card.bowlerId),
    attendeeName: String(card.attendeeName ?? ""),
    attendeeType: card.attendeeType === "guest" ? "guest" : "bowler",
    passType: card.passType === "pool" ? "pool" : "banquet",
    qrUrl: String(card.qrUrl ?? ""),
    under21: Boolean(card.under21),
    hostName: card.hostName ?? null,
  })), [rosterQuery.data]);
  const summary = rosterQuery.data?.summary;

  async function run(action: "download" | "print") {
    if (records.length === 0) {
      toast.error("There are no active QR passes available to print for this event.");
      return;
    }
    setBusy(action);
    try {
      const options = { eventName: eventName?.trim() || "BowlVegas Event", eventId };
      const ok = action === "download"
        ? await downloadQrBusinessCards(records, options)
        : await printQrBusinessCards(records, options);
      if (ok) toast.success(action === "download" ? "QR business-card PDF downloaded" : "QR business-card PDF opened for printing");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the QR business-card PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-cyan-300/35 bg-gradient-to-br from-[#071c2d] via-[#111827] to-[#20150a] p-5 shadow-lg shadow-cyan-950/25">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Print-ready passes</p>
          <h2 className="mt-1 text-2xl font-black text-white">QR business cards for bowlers and guests</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Creates one BowlVegas-branded 3.5 × 2-inch card for every current QR pass. Each card carries the exact stored QR, the bowler or guest name, and its Banquet Dinner or Pool Party entry label. The PDF places 10 cut-ready cards on each letter-size page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void run("download")} disabled={busy !== null || rosterQuery.isLoading || records.length === 0} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "download" ? "Creating PDF…" : "Download QR Business Card PDF"}
          </button>
          <button type="button" onClick={() => void run("print")} disabled={busy !== null || rosterQuery.isLoading || records.length === 0} className="rounded-xl border border-amber-300/55 bg-amber-300/10 px-4 py-2.5 text-sm font-black text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "print" ? "Opening print view…" : "Print QR Business Cards"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-white">{records.length}</div><div className="text-xs text-gray-400">Active QR cards</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-cyan-200">{summary?.bowlerCards ?? records.filter((record) => record.attendeeType === "bowler").length}</div><div className="text-xs text-gray-400">Bowler cards</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-amber-200">{summary?.guestCards ?? records.filter((record) => record.attendeeType === "guest").length}</div><div className="text-xs text-gray-400">Guest cards</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-emerald-200">10</div><div className="text-xs text-gray-400">Cards per page</div></div>
      </div>

      {rosterQuery.isLoading ? <p className="mt-4 text-sm text-gray-400">Loading the authorized event QR roster…</p> : null}
      {rosterQuery.error ? <p className="mt-4 text-sm text-rose-200">Unable to load QR business cards: {rosterQuery.error.message}</p> : null}
      {!rosterQuery.isLoading && !rosterQuery.error && records.length === 0 ? <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">No active QR passes are currently available for this event.</p> : null}
      <p className="mt-3 text-xs leading-5 text-gray-500">For safety, redeemed passes and disabled guest passes are excluded. Printing never changes or regenerates any token; every QR uses the event’s exact existing stored pass.</p>
    </section>
  );
}
