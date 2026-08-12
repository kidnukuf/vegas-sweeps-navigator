import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

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
      if (r.sheet?.error) {
        toast.warning(`Generated ${r.created} code(s), but BL sheet sync needs attention: ${r.sheet.error}`);
      } else {
        toast.success(`Generated ${r.created} new code(s). ${r.sheet?.written ?? 0} code(s) written to Sheet column BL.`);
      }
      utils.claimCodes.listForEvent.invalidate({ eventId });
    },
    onError: (e) => toast.error(e.message),
  });

  const reissue = trpc.claimCodes.reissue.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success(r.sheet?.error ? `New code: ${r.newCode}. BL sync needs attention.` : `New code: ${r.newCode}. Sheet updated.`);
      else toast.error(r.reason);
      utils.claimCodes.listForEvent.invalidate({ eventId });
      if (activeQuery) utils.claimCodes.lookup.invalidate({ eventId, query: activeQuery });
    },
    onError: (e) => toast.error(e.message),
  });

  const syncToSheet = trpc.claimCodes.syncToSheet.useMutation({
    onSuccess: (r) => {
      if (r.error) toast.error(`BL sheet sync failed: ${r.error}`);
      else toast.success(`${r.written} claim code(s) written to Google Sheet column BL.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const stats = useMemo(() => {
    const total = rows.length;
    const unused = rows.filter((r) => r.status === "unused").length;
    const used = rows.filter((r) => r.status === "redeemed").length;
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

  function downloadTeamPdf() {
    const activeTeams = byTeam
      .map(([team, members]) => [team, members.filter((member) => member.status === "unused")] as const)
      .filter(([, members]) => members.length > 0);
    if (activeTeams.length === 0) {
      toast.error("There are no unused claim codes to include in a distribution packet.");
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const cardGap = 12;
    const cardWidth = (pageWidth - margin * 2 - cardGap) / 2;
    const cardHeight = 78;
    const origin = window.location.origin;
    let y = 76;
    let cardIndex = 0;

    const header = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("B.O.B. Roll-Off — Bowler Claim Codes", margin, 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85);
      doc.text("League-night distribution packet • Each code creates one account and may be used once.", margin, 51);
      doc.setTextColor(0);
    };
    const newPage = () => {
      doc.addPage();
      header();
      y = 76;
      cardIndex = 0;
    };

    header();
    for (const [team, members] of activeTeams) {
      if (y + 32 > pageHeight - margin) newPage();
      doc.setFillColor(243, 193, 0);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 20, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`TEAM: ${team}`, margin + 8, y + 14);
      y += 28;

      for (const member of members) {
        if (y + cardHeight > pageHeight - margin) newPage();
        const column = cardIndex % 2;
        const x = margin + column * (cardWidth + cardGap);
        doc.setDrawColor(175);
        doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${member.firstName} ${member.lastName}`, x + 9, y + 17, { maxWidth: cardWidth - 18 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(85);
        doc.text(`${member.center || "Bowling center"} • ${team}`, x + 9, y + 30, { maxWidth: cardWidth - 18 });
        doc.setTextColor(0);
        doc.setFont("courier", "bold");
        doc.setFontSize(15);
        doc.text(member.code, x + 9, y + 51);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(`Use at ${origin}/bowler-login → Create Account`, x + 9, y + 67, { maxWidth: cardWidth - 18 });

        if (column === 1) y += cardHeight + cardGap;
        cardIndex++;
      }
      if (cardIndex % 2 === 1) {
        y += cardHeight + cardGap;
        cardIndex++;
      }
      y += 6;
    }

    doc.save(`BOB-Claim-Codes-Event-${eventId}.pdf`);
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
            🖨️ Print Browser Sheet
          </Button>
          <Button
            onClick={downloadTeamPdf}
            disabled={rows.length === 0}
            className="bg-cyan-400 text-black hover:bg-cyan-300 font-bold"
          >
            ⬇ Download Team PDF
          </Button>
          <Button
            onClick={() => syncToSheet.mutate({ eventId })}
            disabled={rows.length === 0 || syncToSheet.isPending}
            variant="outline"
            className="border-cyan-400/50 text-cyan-200 hover:bg-cyan-400/10"
          >
            {syncToSheet.isPending ? "Writing BL…" : "↻ Write Codes to BL"}
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
    redeemed: "bg-sky-500/15 text-sky-400",
    void: "bg-rose-500/15 text-rose-400",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-white/10 text-gray-300"}`}>
      {status}
    </span>
  );
}
