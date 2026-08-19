import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { getClaimCodeIntroductionUrl } from "@/lib/claimCodeLinks";

/**
 * ClaimCodesTab — Event Director tool to generate, view, look up, and reissue
 * per-bowler claim codes, plus print a distribution sheet (name · team · code · QR)
 * that program directors hand out on league night.
 */
type ClaimCodeEventDetails = {
  name: string;
  year?: string;
  startDate?: string;
  endDate?: string;
};

export default function ClaimCodesTab({ eventId, eventDetails }: { eventId: number; eventDetails?: ClaimCodeEventDetails }) {
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
      } else if ((r.sheet?.notFound ?? 0) > 0) {
        toast.warning(`Generated ${r.created} code(s). ${r.sheet?.written ?? 0} wrote to BL; ${r.sheet?.notFound} did not match a sheet row.`);
      } else {
        toast.success(`Generated ${r.created} new code(s). ${r.sheet?.written ?? 0} code(s) written to Sheet column BL.`);
      }
      utils.claimCodes.listForEvent.invalidate({ eventId });
    },
    onError: (e) => toast.error(e.message),
  });

  const reissue = trpc.claimCodes.reissue.useMutation({
    onSuccess: (r) => {
      if (r.ok) {
        if (r.sheet?.error) toast.warning(`New code: ${r.newCode}. BL sync needs attention.`);
        else if ((r.sheet?.notFound ?? 0) > 0) toast.warning(`New code: ${r.newCode}. ${r.sheet?.notFound ?? 0} sheet row did not match.`);
        else toast.success(`New code: ${r.newCode}. Sheet updated.`);
      }
      else toast.error(r.reason);
      utils.claimCodes.listForEvent.invalidate({ eventId });
      if (activeQuery) utils.claimCodes.lookup.invalidate({ eventId, query: activeQuery });
    },
    onError: (e) => toast.error(e.message),
  });

  const syncToSheet = trpc.claimCodes.syncToSheet.useMutation({
    onSuccess: (r) => {
      if (r.error) toast.error(`BL sheet sync failed: ${r.error}`);
      else if (r.notFound > 0) toast.warning(`${r.written} claim code(s) wrote to BL; ${r.notFound} did not match a sheet row.`);
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

  const centerPackets = useMemo(() => {
    const centers = new Map<string, typeof rows>();
    for (const row of rows.filter((row) => row.status === "unused")) {
      const center = row.center || "Unassigned Center";
      if (!centers.has(center)) centers.set(center, []);
      centers.get(center)!.push(row);
    }
    return Array.from(centers.entries())
      .map(([center, members]) => ({
        center,
        members,
        teamCount: new Set(members.map((member) => member.team || "— No Team —")).size,
      }))
      .sort((a, b) => a.center.localeCompare(b.center));
  }, [rows]);

  const eventTitle = eventDetails?.name || "B.O.B. Roll-Off";
  const signUpUrl = getClaimCodeIntroductionUrl(eventId);
  const eventDateWindow = useMemo(() => {
    const start = eventDetails?.startDate?.trim();
    const end = eventDetails?.endDate?.trim();
    if (start && end) return start === end ? start : `${start} – ${end}`;
    if (start) return start;
    if (end) return end;
    return eventDetails?.year || "Event dates to be announced";
  }, [eventDetails]);

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
              <img src="${qr(signUpUrl)}" alt="Open Bowl Vegas introduction" />
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

  async function downloadCenterPdf(centerName: string, centerMembers: typeof rows) {
    const teams = new Map<string, typeof rows>();
    for (const member of centerMembers) {
      const team = member.team || "— No Team —";
      if (!teams.has(team)) teams.set(team, []);
      teams.get(team)!.push(member);
    }
    const activeTeams = Array.from(teams.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const signUpQr = await QRCode.toDataURL(signUpUrl, {
      width: 160,
      margin: 1,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 24;
    const columnGap = 10;
    const rowGap = 8;
    const gridTop = 58;
    const teamsPerPage = 8;
    const cardWidth = (pageWidth - margin * 2 - columnGap) / 2;
    const cardHeight = (pageHeight - gridTop - margin - rowGap * 3) / 4;
    const maxMembersPerCard = 4;
    const teamCards = activeTeams.flatMap(([team, members]) => {
      const cards = [] as Array<{ team: string; members: typeof members; continuation: boolean }>;
      for (let index = 0; index < members.length; index += maxMembersPerCard) {
        cards.push({
          team,
          members: members.slice(index, index + maxMembersPerCard),
          continuation: index > 0,
        });
      }
      return cards;
    });

    const header = (pageNumber: number, pageCount: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(`${eventTitle} — Team Claim Code Cards`, margin, 28, { maxWidth: pageWidth - margin * 2 - 90 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(85);
      doc.text(`${centerName} • ${eventDateWindow}`, margin, 40, { maxWidth: pageWidth - margin * 2 - 90 });
      doc.text("Cut along each card border and distribute by team. Each code creates one account and may be used once.", margin, 50);
      doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, 28, { align: "right" });
      doc.setTextColor(0);
    };
    const pageCount = Math.ceil(teamCards.length / teamsPerPage);

    teamCards.forEach((card, index) => {
      const pageIndex = Math.floor(index / teamsPerPage);
      const slot = index % teamsPerPage;
      if (slot === 0) {
        if (index > 0) doc.addPage();
        header(pageIndex + 1, pageCount);
      }

      const column = slot % 2;
      const row = Math.floor(slot / 2);
      const x = margin + column * (cardWidth + columnGap);
      const y = gridTop + row * (cardHeight + rowGap);
      doc.setDrawColor(105);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, "S");
      doc.setFillColor(14, 23, 37);
      doc.roundedRect(x, y, cardWidth, 44, 3, 3, "F");
      doc.rect(x, y + 35, cardWidth, 9, "F");
      doc.setTextColor(175);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.9);
      doc.text(eventDateWindow, x + 8, y + 10, { maxWidth: cardWidth - 16 });
      doc.setTextColor(220);
      doc.setFontSize(7.2);
      doc.text(centerName, x + 8, y + 21, { maxWidth: cardWidth - 16 });
      doc.setFillColor(243, 193, 0);
      doc.rect(x, y + 28, cardWidth, 16, "F");
      doc.setTextColor(17);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.7);
      doc.text(`TEAM: ${card.team}${card.continuation ? " (CONT.)" : ""}`, x + 8, y + 39, { maxWidth: cardWidth - 16 });
      doc.setTextColor(0);

      const bowlerColumnWidth = (cardWidth - 24) / 2;
      const bowlerColumns = [card.members.slice(0, 2), card.members.slice(2, 4)];
      bowlerColumns.forEach((members, columnIndex) => {
        const memberX = x + 8 + columnIndex * (bowlerColumnWidth + 8);
        let memberY = y + 53;
        for (const member of members) {
          doc.setDrawColor(220);
          doc.setLineWidth(0.35);
          doc.line(memberX, memberY, memberX + bowlerColumnWidth, memberY);
          doc.addImage(signUpQr, "PNG", memberX + 2, memberY + 4, 27, 27);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.7);
          doc.text(`${member.firstName} ${member.lastName}`, memberX + 33, memberY + 13, { maxWidth: bowlerColumnWidth - 35 });
          doc.setFont("courier", "bold");
          doc.setFontSize(8.7);
          doc.text(member.code, memberX + 33, memberY + 26, { maxWidth: bowlerColumnWidth - 35 });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(4.9);
          doc.setTextColor(90);
          doc.text("SCAN TO SIGN UP", memberX + 15.5, memberY + 35, { align: "center" });
          doc.setTextColor(0);
          memberY += 47;
        }
      });

      doc.setDrawColor(180);
      doc.setLineWidth(0.35);
      doc.line(x + 8, y + cardHeight - 21, x + cardWidth - 8, y + cardHeight - 21);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(85);
      doc.text("Each bowler: scan your QR → Create Account → enter your claim code.", x + 8, y + cardHeight - 9, { maxWidth: cardWidth - 16 });
      doc.setTextColor(0);
    });

    const safeCenter = centerName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const safeEvent = eventTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    doc.save(`${safeEvent || "BOB"}-${safeCenter || "Center"}-Claim-Code-Cards.pdf`);
  }

  function downloadAllCenterPdfs() {
    if (centerPackets.length === 0) {
      toast.error("There are no unused claim codes to include in center packets.");
      return;
    }
    const allowed = window.confirm(
      `Download ${centerPackets.length} center PDF packet${centerPackets.length !== 1 ? "s" : ""}? Your browser may ask you to allow multiple downloads.`
    );
    if (!allowed) return;
    for (const packet of centerPackets) {
      void downloadCenterPdf(packet.center, packet.members);
    }
    toast.success(`Started ${centerPackets.length} center PDF download${centerPackets.length !== 1 ? "s" : ""}.`);
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
            onClick={() => syncToSheet.mutate({ eventId })}
            disabled={rows.length === 0 || syncToSheet.isPending}
            variant="outline"
            className="border-cyan-400/50 text-cyan-200 hover:bg-cyan-400/10"
          >
            {syncToSheet.isPending ? "Writing BL…" : "↻ Write Codes to BL"}
          </Button>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-sm font-bold text-cyan-200">Center Coordinator PDF Packets</p>
          <p className="mt-1 text-xs text-gray-400">
            Each download includes only that center’s teams, arranged as eight cut-ready team cards per page with the event name and date window.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              onClick={downloadAllCenterPdfs}
              disabled={centerPackets.length === 0}
              className="bg-cyan-400 text-black hover:bg-cyan-300 font-bold"
            >
              📦 Download All Center PDFs
            </Button>
            <span className="text-xs text-gray-500">Allow multiple downloads if your browser asks.</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {centerPackets.map((packet) => (
              <Button
                key={packet.center}
                onClick={() => void downloadCenterPdf(packet.center, packet.members)}
                className="h-auto justify-start bg-cyan-400 px-3 py-2 text-left text-black hover:bg-cyan-300"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">⬇ {packet.center}</span>
                  <span className="block text-xs opacity-80">
                    {packet.teamCount} team{packet.teamCount !== 1 ? "s" : ""} · {packet.members.length} unused code{packet.members.length !== 1 ? "s" : ""}
                  </span>
                </span>
              </Button>
            ))}
            {centerPackets.length === 0 && (
              <p className="text-xs text-gray-500">Generate unused claim codes before creating coordinator packets.</p>
            )}
          </div>
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
