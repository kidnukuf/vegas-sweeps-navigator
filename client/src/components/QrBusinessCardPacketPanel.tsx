import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadQrBusinessCards, printQrBusinessCards, type QrBusinessCardRecord } from "@/lib/qrBusinessCardsPdf";

type Props = { eventId: number; eventName?: string | null };

type RosterCard = {
  cardId: string;
  bowlerId: number;
  attendeeName: string;
  attendeeType: "bowler" | "guest";
  passType: "banquet" | "pool";
  qrUrl: string;
  under21: boolean;
  hostName: string | null;
  centerId: number | null;
  centerName: string | null;
  teamId: number | null;
  teamName: string | null;
};

export function toQrBusinessCardRecord(card: RosterCard): QrBusinessCardRecord {
  return {
    cardId: String(card.cardId),
    bowlerId: Number(card.bowlerId),
    attendeeName: String(card.attendeeName ?? ""),
    attendeeType: card.attendeeType === "guest" ? "guest" : "bowler",
    passType: card.passType === "pool" ? "pool" : "banquet",
    qrUrl: String(card.qrUrl ?? ""),
    under21: Boolean(card.under21),
    hostName: card.hostName ?? null,
    centerId: card.centerId ?? null,
    centerName: card.centerName ?? null,
    teamId: card.teamId ?? null,
    teamName: card.teamName ?? null,
  };
}

export default function QrBusinessCardPacketPanel({ eventId, eventName }: Props) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [centerId, setCenterId] = useState("");
  const [teamId, setTeamId] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("vsn_ed_token") ?? "" : "";
  const rosterQuery = trpc.bowlerAuth.getQrBusinessCardRoster.useQuery(
    {
      token,
      eventId,
      centerId: centerId ? Number(centerId) : undefined,
      teamId: teamId ? Number(teamId) : undefined,
    },
    { enabled: Boolean(token && eventId > 0), retry: false },
  );
  const records = useMemo<QrBusinessCardRecord[]>(
    () => (rosterQuery.data?.cards ?? []).map((card) => toQrBusinessCardRecord(card as RosterCard)),
    [rosterQuery.data],
  );
  const centers = rosterQuery.data?.availableCenters ?? [];
  const teams = useMemo(
    () => (rosterQuery.data?.availableTeams ?? []).filter((team) => !centerId || String(team.centerId ?? "") === centerId),
    [centerId, rosterQuery.data?.availableTeams],
  );
  const selectedCenter = centers.find((center) => String(center.id) === centerId);
  const selectedTeam = teams.find((team) => String(team.id) === teamId);
  const batchLabel = [selectedCenter?.centerName, selectedTeam?.teamName].filter(Boolean).join(" — ") || null;
  const summary = rosterQuery.data?.summary;

  async function run(action: "download" | "print") {
    if (records.length === 0) {
      toast.error("There are no active QR passes available for this selection.");
      return;
    }
    setBusy(action);
    try {
      const options = { eventName: eventName?.trim() || "BowlVegas Event", eventId, batchLabel };
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

  function chooseCenter(nextCenterId: string) {
    setCenterId(nextCenterId);
    setTeamId("");
  }

  return (
    <section className="mb-6 rounded-2xl border border-cyan-300/35 bg-gradient-to-br from-[#071c2d] via-[#111827] to-[#20150a] p-5 shadow-lg shadow-cyan-950/25">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Print-ready passes</p>
          <h2 className="mt-1 text-2xl font-black text-white">QR business cards for bowlers and guests</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Create BowlVegas-branded 3.5 × 2-inch cards from the exact active stored QR passes. Filter by center and team to prepare one distribution batch at a time; each PDF contains 10 cut-ready cards per letter-size page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void run("download")} disabled={busy !== null || rosterQuery.isLoading || records.length === 0} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "download" ? "Creating PDF…" : "Download selected batch"}
          </button>
          <button type="button" onClick={() => void run("print")} disabled={busy !== null || rosterQuery.isLoading || records.length === 0} className="rounded-xl border border-amber-300/55 bg-amber-300/10 px-4 py-2.5 text-sm font-black text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "print" ? "Opening print view…" : "Print selected batch"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-cyan-100">
          Bowling center
          <select value={centerId} onChange={(event) => chooseCenter(event.target.value)} className="rounded-lg border border-white/15 bg-[#07111f] px-3 py-2 text-sm normal-case text-white outline-none focus:border-cyan-300">
            <option value="">All event centers</option>
            {centers.map((center) => <option key={center.id} value={center.id}>{center.centerName}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-cyan-100">
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="rounded-lg border border-white/15 bg-[#07111f] px-3 py-2 text-sm normal-case text-white outline-none focus:border-cyan-300">
            <option value="">All teams{selectedCenter ? ` at ${selectedCenter.centerName}` : ""}</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setCenterId(""); setTeamId(""); }} disabled={!centerId && !teamId} className="self-end rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
          Clear filters
        </button>
      </div>
      <p className="mt-2 text-xs text-cyan-100/70">{batchLabel ? `Batch: ${batchLabel}` : "Batch: all active event QR passes"}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-white">{records.length}</div><div className="text-xs text-gray-400">Cards in batch</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-cyan-200">{summary?.bowlerCards ?? records.filter((record) => record.attendeeType === "bowler").length}</div><div className="text-xs text-gray-400">Bowler cards</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-amber-200">{summary?.guestCards ?? records.filter((record) => record.attendeeType === "guest").length}</div><div className="text-xs text-gray-400">Guest cards</div></div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-2xl font-black text-emerald-200">10</div><div className="text-xs text-gray-400">Cards per page</div></div>
      </div>

      {rosterQuery.isLoading ? <p className="mt-4 text-sm text-gray-400">Loading the authorized QR-card batch…</p> : null}
      {rosterQuery.error ? <p className="mt-4 text-sm text-rose-200">Unable to load QR business cards: {rosterQuery.error.message}</p> : null}
      {!rosterQuery.isLoading && !rosterQuery.error && records.length === 0 ? <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">No active QR passes match this center and team selection.</p> : null}
      <p className="mt-3 text-xs leading-5 text-gray-500">For safety, filters run on the server before QR URLs are returned. Redeemed passes and disabled guest passes are excluded; printing never changes or regenerates any token.</p>
    </section>
  );
}
