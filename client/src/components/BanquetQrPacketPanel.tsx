import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadBanquetQrPacket, printBanquetQrPacket, type BanquetQrPacketRecord } from "@/lib/banquetQrPacketPdf";

type Props = { eventId: number; eventName?: string | null; eventYear?: number | null; startDate?: string | null; endDate?: string | null };

function dateWindow(start?: string | null, end?: string | null, year?: number | null) {
  if (start && end) return start === end ? start : `${start} – ${end}`;
  return start || end || (year ? String(year) : "Event dates to be announced");
}

export default function BanquetQrPacketPanel({ eventId, eventName, eventYear, startDate, endDate }: Props) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("vsn_ed_token") ?? "" : "";
  const rosterQuery = trpc.bowlerAuth.getBanquetQrRoster.useQuery(
    { token, eventId },
    { enabled: Boolean(token && eventId > 0), retry: false },
  );
  const dateLabel = dateWindow(startDate, endDate, eventYear);
  const records = useMemo<BanquetQrPacketRecord[]>(() => (rosterQuery.data?.codes ?? []).map((code) => ({
    bowlerId: Number(code.bowlerId),
    firstName: String(code.firstName ?? ""),
    lastName: String(code.lastName ?? ""),
    scantronId: code.scantronId,
    banquetToken: String(code.banquetToken ?? ""),
    banquetUrl: String(code.banquetUrl ?? ""),
    banquetUsed: Boolean(code.banquetUsed),
    under21: Boolean(code.under21),
    centerName: code.centerName,
    teamName: code.teamName,
  })), [rosterQuery.data]);
  const activeCount = records.filter((record) => !record.banquetUsed).length;
  const usedCount = records.length - activeCount;

  async function run(action: "download" | "print") {
    if (records.length === 0) {
      toast.error("No banquet QR codes have been generated for this event yet.");
      return;
    }
    setBusy(action);
    try {
      const options = { eventName: eventName?.trim() || "Bowl Vegas Event", eventId, dateWindow: dateLabel };
      const ok = action === "download"
        ? await downloadBanquetQrPacket(records, options)
        : await printBanquetQrPacket(records, options);
      if (ok) toast.success(action === "download" ? "Banquet QR PDF downloaded" : "Banquet QR PDF opened for duplex printing");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the banquet QR PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#211a0b] via-[#17120b] to-[#111827] p-5 shadow-lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Banquet QR Operations</p>
          <h2 className="mt-1 text-2xl font-black text-white">Print the complete banquet QR roster</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            These are the exact stored banquet tokens used by the bowlers’ banquet QR passes. The PDF places 12 cards on each front page and creates a mirrored back page for duplex printing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void run("download")} disabled={busy !== null || rosterQuery.isLoading || records.length === 0} className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "download" ? "Creating PDF…" : "Download Banquet QR PDF"}
          </button>
          <button type="button" onClick={() => void run("print")} disabled={busy !== null || rosterQuery.isLoading || records.length === 0} className="rounded-xl border border-cyan-300/50 bg-cyan-400/15 px-4 py-2.5 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "print" ? "Opening print view…" : "Print All — Duplex"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-white">{records.length}</div><div className="text-xs text-gray-400">Banquet codes</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-emerald-300">{activeCount}</div><div className="text-xs text-gray-400">Available</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-rose-300">{usedCount}</div><div className="text-xs text-gray-400">Redeemed</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-amber-200">12</div><div className="text-xs text-gray-400">Per page</div></div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        {rosterQuery.isLoading ? <div className="p-5 text-sm text-gray-400">Loading the event’s exact banquet token roster…</div> : rosterQuery.error ? <div className="p-5 text-sm text-rose-200">Unable to load the banquet roster: {rosterQuery.error.message}</div> : records.length === 0 ? <div className="p-5 text-sm text-gray-400">No banquet QR codes have been generated for this event.</div> : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Bowler</th><th className="px-4 py-3">Center / Team</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">QR payload</th></tr></thead>
            <tbody>{records.map((record, index) => <tr key={record.bowlerId} className="border-b border-white/5 last:border-0"><td className="px-4 py-3 text-gray-500">{index + 1}</td><td className="px-4 py-3 font-semibold text-white">{record.firstName} {record.lastName}{record.under21 && <span className="ml-2 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-rose-200">Under 21</span>}</td><td className="px-4 py-3 text-gray-300">{record.centerName || "—"}<span className="block text-xs text-gray-500">{record.teamName || "—"}</span></td><td className="px-4 py-3">{record.banquetUsed ? <span className="text-rose-300">Redeemed</span> : <span className="text-emerald-300">Available</span>}</td><td className="max-w-[360px] truncate px-4 py-3 font-mono text-xs text-gray-500" title={record.banquetUrl}>{record.banquetUrl}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-gray-500">For duplex printing, choose 100% scale and flip on the long edge. The back pages mirror the front-page columns so each printed card stays paired with the correct QR code.</p>
    </section>
  );
}
