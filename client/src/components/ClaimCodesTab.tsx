import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * ClaimCodesTab — Event Director tool to generate, view, look up, and reissue
 * per-bowler claim codes, plus print a distribution sheet (name · team · code · QR)
 * that program directors hand out on league night.
 */
export default function ClaimCodesTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.claimCodes.listForEvent.useQuery({ eventId });
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const lookup = trpc.claimCodes.lookup.useQuery(
    { eventId, query: activeQuery },
    { enabled: activeQuery.trim().length > 0 }
  );

  const generate = trpc.claimCodes.generateForEvent.useMutation({
    onSuccess: (r) => {
      toast.success(`Generated ${r.created} new code(s). Total: ${r.totalForEvent}.`);
      utils.claimCodes.listForEvent.invalidate({ eventId });
    },
    onError: (e) => toast.error(e.message),
  });

  const reissue = trpc.claimCodes.reissue.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success(`New code: ${r.newCode}`);
      else toast.error(r.reason);
      utils.claimCodes.listForEvent.invalidate({ eventId });
      if (activeQuery) utils.claimCodes.lookup.invalidate({ eventId, query: activeQuery });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const stats = useMemo(() => {
    const total = rows.length;
    const unused = rows.filter((r) => r.status === "unused").length;
    const used = rows.filter((r) => r.status === "used").length;
    const voided = rows.filter((r) => r.status === "void").length;
    return { total, unused, used, voided };
  }, [rows]);

  // Group by team for the printable sheet
  const byTeam = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.team || "— No Team —";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  function printSheet() {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Pop-up blocked — allow pop-ups to print.");
      return;
    }
    const qr = (code: string) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(code)}`;

    const teamsHtml = byTeam
      .map(([team, members]) => {
        const cards = members
          .filter((m) => m.status !== "void")
          .map(
            (m) => `
            <div class="card">
              <img src="${qr(m.code)}" alt="${m.code}" />
              <div class="info">
                <div class="name">${m.firstName} ${m.lastName}</div>
                <div class="center">${m.center || ""}</div>
                <div class="code">${m.code}</div>
              </div>
            </div>`
          )
          .join("");
        return `<section class="team"><h2>${team}</h2><div class="grid">${cards}</div></section>`;
      })
      .join("");

    win.document.write(`
      <html><head><title>B.O.B. Roll-Off — Claim Codes</title>
      <style>
        * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
        body { margin: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 20px; }
        .team { margin-bottom: 22px; page-break-inside: avoid; }
        .team h2 { font-size: 14px; background: #f3c100; color: #111; padding: 6px 10px; border-radius: 6px; margin: 0 0 10px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .card { border: 1px solid #ccc; border-radius: 8px; padding: 10px; display: flex; gap: 10px; align-items: center; page-break-inside: avoid; }
        .card img { width: 70px; height: 70px; }
        .name { font-weight: bold; font-size: 13px; }
        .center { color: #666; font-size: 10px; }
        .code { font-family: 'Courier New', monospace; font-weight: bold; font-size: 15px; letter-spacing: 1px; margin-top: 4px; }
        @media print { .noprint { display: none; } }
      </style></head><body>
      <h1>B.O.B. Roll-Off — Bowler Claim Codes</h1>
      <div class="sub">Hand each bowler their own code on league night. Each code activates one account, one time. Keep this sheet confidential.</div>
      <button class="noprint" onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;background:#f3c100;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">🖨️ Print</button>
      ${teamsHtml}
      </body></html>`);
    win.document.close();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-[#111] p-5">
        <h2 className="text-xl font-black text-yellow-400">🔐 Bowler Claim Codes</h2>
        <p className="mt-1 text-sm text-gray-400 leading-relaxed">
          Generate one unique code per bowler, then print the distribution sheet for program
          directors to hand out on league night. New sign-ups for this event will require a valid,
          unused code — protecting bowlers from impersonation. Regenerating never touches codes that
          have already been redeemed.
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total" value={stats.total} />
          <Stat label="Unused" value={stats.unused} tone="text-emerald-400" />
          <Stat label="Redeemed" value={stats.used} tone="text-sky-400" />
          <Stat label="Voided" value={stats.voided} tone="text-rose-400" />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            onClick={() => generate.mutate({ eventId, regenerateUnused: false })}
            disabled={generate.isPending}
            className="bg-yellow-500 text-black hover:bg-yellow-400 font-bold"
          >
            {generate.isPending ? "Generating…" : "➕ Generate Missing Codes"}
          </Button>
          <Button
            onClick={() => {
              if (
                confirm(
                  "Delete all UNUSED codes and mint fresh ones? Redeemed codes are kept. Use only before distributing the sheet."
                )
              ) {
                generate.mutate({ eventId, regenerateUnused: true });
              }
            }}
            disabled={generate.isPending}
            variant="outline"
            className="border-white/20 text-gray-200 hover:bg-white/5"
          >
            ♻️ Regenerate Unused
          </Button>
          <Button
            onClick={printSheet}
            disabled={rows.length === 0}
            className="bg-white text-black hover:bg-gray-200 font-bold"
          >
            🖨️ Print Distribution Sheet
          </Button>
        </div>
      </div>

      {/* Lost-code lookup */}
      <div className="rounded-xl border border-white/10 bg-[#111] p-5">
        <h3 className="text-sm font-bold text-yellow-400 mb-2">🔎 Look Up / Reissue a Code</h3>
        <p className="text-xs text-gray-500 mb-3">
          Search by bowler name or code to help someone who lost theirs. Reissue voids the old code
          and creates a new one for that bowler.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Name or code (e.g. Smith or BOB-7F3K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setActiveQuery(query)}
            className="bg-black/40 border-white/15 text-white"
          />
          <Button
            onClick={() => setActiveQuery(query)}
            className="bg-yellow-500 text-black hover:bg-yellow-400 font-bold"
          >
            Search
          </Button>
        </div>

        {activeQuery && (
          <div className="mt-4 space-y-2">
            {lookup.isLoading && <p className="text-sm text-gray-500">Searching…</p>}
            {lookup.data && lookup.data.length === 0 && (
              <p className="text-sm text-gray-500">No matches for “{activeQuery}”.</p>
            )}
            {(lookup.data ?? []).map((m) => (
              <div
                key={m.codeId}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-4 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    {m.firstName} {m.lastName}{" "}
                    <span className="text-gray-500 font-normal">· {m.team || "no team"}</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-mono text-yellow-300">{m.code}</span>{" "}
                    <StatusBadge status={m.status} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 text-gray-200 hover:bg-white/5"
                  disabled={reissue.isPending || m.status === "void"}
                  onClick={() => {
                    if (confirm(`Reissue a new code for ${m.firstName} ${m.lastName}? The current code will stop working.`)) {
                      reissue.mutate({ eventId, codeId: m.codeId });
                    }
                  }}
                >
                  ♻️ Reissue
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full table */}
      <div className="rounded-xl border border-white/10 bg-[#111] p-5">
        <h3 className="text-sm font-bold text-yellow-400 mb-3">
          All Codes {rows.length > 0 && <span className="text-gray-500">({rows.length})</span>}
        </h3>
        {list.isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No codes yet. Click “Generate Missing Codes” to create one per bowler.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/10">
                  <th className="py-2 pr-4">Bowler</th>
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.codeId} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-white">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{r.team || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-yellow-300">{r.code}</td>
                    <td className="py-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3">
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    unused: "bg-emerald-500/15 text-emerald-400",
    used: "bg-sky-500/15 text-sky-400",
    void: "bg-rose-500/15 text-rose-400",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-white/10 text-gray-300"}`}>
      {status}
    </span>
  );
}
