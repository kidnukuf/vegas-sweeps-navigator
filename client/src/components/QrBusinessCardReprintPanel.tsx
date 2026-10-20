import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { printQrBusinessCards, type QrBusinessCardRecord } from "@/lib/qrBusinessCardsPdf";
import { toQrBusinessCardRecord } from "@/components/QrBusinessCardPacketPanel";

type Props = {
  eventId: number;
  eventName?: string | null;
  bowlerId: number;
  bowlerName: string;
};

export default function QrBusinessCardReprintPanel({ eventId, eventName, bowlerId, bowlerName }: Props) {
  const [isPrinting, setIsPrinting] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("vsn_ed_token") ?? "" : "";
  const cardsQuery = trpc.bowlerAuth.getQrBusinessCardRoster.useQuery(
    { token, eventId, bowlerId },
    { enabled: Boolean(token && eventId > 0 && bowlerId > 0), retry: false },
  );
  const cards = useMemo<QrBusinessCardRecord[]>(
    () => (cardsQuery.data?.cards ?? []).map((card) => toQrBusinessCardRecord(card)),
    [cardsQuery.data],
  );

  async function reprint() {
    if (cards.length === 0) {
      toast.error("This bowler has no active QR cards to reprint.");
      return;
    }
    setIsPrinting(true);
    try {
      const ok = await printQrBusinessCards(cards, {
        eventName: eventName?.trim() || "BowlVegas Event",
        eventId,
        batchLabel: `${bowlerName} reprint`,
      });
      if (ok) toast.success(`Opened ${cards.length} active QR card${cards.length === 1 ? "" : "s"} for ${bowlerName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the selected QR business cards");
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <section className="rounded-xl border border-cyan-300/25 bg-cyan-400/[0.06] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">QR business-card reprint</p>
          <p className="mt-1 text-xs leading-5 text-gray-300">Print only this bowler’s current active QR cards and their active guest cards. No QR credential is regenerated or changed.</p>
        </div>
        <button
          type="button"
          onClick={() => void reprint()}
          disabled={isPrinting || cardsQuery.isLoading || cards.length === 0}
          className="shrink-0 rounded-lg border border-cyan-200/60 bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPrinting ? "Opening print view…" : `Reprint ${cards.length || ""} active QR card${cards.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {cardsQuery.isLoading ? <p className="mt-2 text-xs text-cyan-100/70">Loading this bowler’s authorized QR cards…</p> : null}
      {cardsQuery.error ? <p className="mt-2 text-xs text-rose-200">Unable to load reprint cards: {cardsQuery.error.message}</p> : null}
      {!cardsQuery.isLoading && !cardsQuery.error && cards.length === 0 ? <p className="mt-2 text-xs text-amber-100">No active QR cards are currently assigned to this bowler.</p> : null}
    </section>
  );
}
