import { useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadQrMasterPrint, type QrMasterPrintRecord } from "@/lib/qrMasterPrintPdf";

type Props = { eventId: number; eventName?: string | null };

export default function QrMasterPrintPanel({ eventId, eventName }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("vsn_ed_token") ?? "" : "";
  // No center/team/bowler filters: this button always prints the entire selected event.
  // Refetch on each click so edits and revocations are reflected in the PDF.
  const rosterQuery = trpc.bowlerAuth.getQrBusinessCardRoster.useQuery(
    { token, eventId, masterPrint: true },
    { enabled: false, retry: false },
  );

  async function download() {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    try {
      const result = await rosterQuery.refetch();
      if (result.error) throw result.error;
      const records = (result.data?.cards ?? []) as QrMasterPrintRecord[];
      if (!records.length) {
        toast.info("No assigned QR passes are available for this event.");
        return;
      }
      const ok = await downloadQrMasterPrint(records, {
        eventId,
        eventName: eventName?.trim() || "BowlVegas Event",
        onProgress: (completed, total) => setProgress({ completed, total }),
      });
      if (ok) toast.success(`QR Code Master Print downloaded: ${records.length} QR codes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create QR Code Master Print. Please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-300/40 bg-gradient-to-br from-[#21190b] via-[#111827] to-[#071c2d] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-amber-200">Event-wide QR master packet</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Download every assigned bowler, team captain, and guest QR pass for this event in one PDF.
            Cards are ordered by <strong>center A–Z, league, then team number</strong>, with each bowler&apos;s guest cards kept alongside their own.
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-400">
            Each card shows the person&apos;s name; guest cards also show their host bowler or a labeled Guest Pass when the guest name is not provided.
            BowlVegas branding, center, league, and team number appear on every card. Print 10 standard 3.5 × 2-inch cards per letter-size page at 100% / Actual size.
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-400">
            Printing never changes a QR code. Already-redeemed codes are clearly marked and remain unusable for reentry.
            Removed or disabled passes and unavailable event activities are excluded; November has no pool passes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy || !token || eventId <= 0}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
          QR Code Master Print
        </button>
      </div>
      {busy ? <p className="mt-3 text-sm text-amber-100" role="status" aria-live="polite">
        {progress ? `Preparing QR card ${progress.completed} of ${progress.total}…` : "Loading the complete authorized event roster…"}
      </p> : null}
    </section>
  );
}
