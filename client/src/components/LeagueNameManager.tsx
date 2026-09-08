import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type LeagueLabel = {
  centerId: number;
  centerName: string;
  leagueCode: string;
  leagueName: string;
  bowlerCount: number;
};

export default function LeagueNameManager({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const labels = trpc.leagueLabels.list.useQuery({ eventId }, { enabled: eventId > 0 });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = trpc.leagueLabels.save.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.leagueLabels.list.invalidate({ eventId }),
        utils.bowlers.adminList.invalidate({ eventId }),
      ]);
      toast.success("League Name saved. Bowler IDs and QR codes were not changed.");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const raw of labels.data ?? []) {
      const label = raw as LeagueLabel;
      const key = `${label.centerId}:${label.leagueCode}`;
      next[key] = drafts[key] ?? label.leagueName ?? `League ${label.leagueCode}`;
    }
    if (Object.keys(next).length) setDrafts((previous) => ({ ...next, ...previous }));
  }, [labels.data]);

  const entries = (labels.data ?? []) as LeagueLabel[];
  if (!eventId) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-5">
      <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-4 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-200">League labels</p>
            <h2 className="mt-1 text-lg font-bold text-white">Human-readable League Names</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-300">Name each league for staff and bowlers. The existing two-digit League Code remains unchanged in every Bowler ID, QR pass, and seating assignment.</p>
          </div>
          <span className="rounded-full border border-violet-300/30 bg-slate-950/50 px-2.5 py-1 text-xs font-semibold text-violet-100">{entries.length} roster group{entries.length === 1 ? "" : "s"}</span>
        </div>
        {labels.isLoading ? <p className="mt-4 text-sm text-slate-400">Loading league groups…</p> : labels.error ? <p className="mt-4 rounded-xl border border-rose-400/35 bg-rose-500/10 p-3 text-sm text-rose-100">League labels could not be loaded: {labels.error.message}</p> : entries.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-400">League groups appear here after bowlers with generated IDs are imported for this event.</p> : <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {entries.map((entry) => {
            const key = `${entry.centerId}:${entry.leagueCode}`;
            const value = drafts[key] ?? entry.leagueName ?? `League ${entry.leagueCode}`;
            return <article key={key} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold text-white">{entry.centerName}</p><p className="text-xs text-violet-200">League Code {entry.leagueCode} · {entry.bowlerCount} bowler{Number(entry.bowlerCount) === 1 ? "" : "s"}</p></div></div><div className="flex gap-2"><input value={value} maxLength={255} onChange={(event) => setDrafts((previous) => ({ ...previous, [key]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-300" aria-label={`League Name for ${entry.centerName}, code ${entry.leagueCode}`} /><button disabled={save.isPending || !value.trim() || value.trim() === entry.leagueName} onClick={() => save.mutate({ eventId, centerId: entry.centerId, leagueCode: entry.leagueCode, leagueName: value.trim() })} className="rounded-lg bg-violet-300 px-3 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-45">Save</button></div></article>;
          })}
        </div>}
      </div>
    </section>
  );
}
