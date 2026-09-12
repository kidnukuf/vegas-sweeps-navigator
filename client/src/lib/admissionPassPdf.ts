import { jsPDF } from "jspdf";

export type AdmissionPassRecord = {
  eventName?: string | null;
  eventYear?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  poolPartyEnabled?: boolean | number | null;
  banquetLocation?: string | null;
  banquetTime?: string | null;
  poolPartyTime?: string | null;
  bowlerId: number;
  firstName?: string | null;
  lastName?: string | null;
  bowlerIdLabel?: string | null;
  centerName?: string | null;
  teamName?: string | null;
  under21?: boolean | number | null;
  guestNames?: string | null;
  guestCount?: number | null;
  hasPoolPass?: boolean | number | null;
  hasBanquetPass?: boolean | number | null;
};

function bool(value: boolean | number | null | undefined) {
  return value === true || value === 1;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Bowl-Vegas";
}

function dateWindow(pass: AdmissionPassRecord, fallback?: string) {
  if (fallback && fallback !== "Event dates to be announced") return fallback;
  const start = pass.startDate?.trim();
  const end = pass.endDate?.trim();
  if (start && end) return start === end ? start : `${start} – ${end}`;
  return start || end || String(pass.eventYear ?? fallback ?? "Event dates to be announced");
}

export function downloadAdmissionPassPacket(records: AdmissionPassRecord[], options?: { eventName?: string; dateWindow?: string }) {
  const passes = [...records].sort((a, b) => {
    const center = String(a.centerName ?? "").localeCompare(String(b.centerName ?? ""));
    if (center !== 0) return center;
    const team = String(a.teamName ?? "").localeCompare(String(b.teamName ?? ""));
    if (team !== 0) return team;
    return `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`);
  });
  if (passes.length === 0) return false;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const gap = 12;
  const headerHeight = 34;
  const cardWidth = (pageWidth - margin * 2 - gap) / 2;
  const cardHeight = (pageHeight - margin * 2 - headerHeight - gap) / 2;
  const totalPages = Math.ceil(passes.length / 4);
  const packetEventName = options?.eventName?.trim() || passes[0].eventName || "Bowl Vegas Event";
  const packetDateWindow = dateWindow(passes[0], options?.dateWindow);

  const writeHeader = (pageNumber: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(`${packetEventName} — Bowler Admission Passes`, margin, 18, { maxWidth: pageWidth - margin * 2 - 70 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(`${packetDateWindow} • Sorted by center, team, and bowler • Print on card stock`, margin, 29, { maxWidth: pageWidth - margin * 2 - 70 });
    doc.text(`${pageNumber} / ${totalPages}`, pageWidth - margin, 18, { align: "right" });
    doc.setTextColor(0);
  };

  passes.forEach((pass, index) => {
    const slot = index % 4;
    if (slot === 0) {
      if (index > 0) doc.addPage();
      writeHeader(Math.floor(index / 4) + 1);
    }
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    const x = margin + col * (cardWidth + gap);
    const y = margin + headerHeight + row * (cardHeight + gap);
    const center = String(pass.centerName ?? "Unassigned center");
    const team = String(pass.teamName ?? "Unassigned team");
    const fullName = `${pass.firstName ?? ""} ${pass.lastName ?? ""}`.trim() || "Unnamed bowler";

    doc.setDrawColor(75);
    doc.setLineWidth(1);
    doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, "S");
    doc.setFillColor(11, 23, 38);
    doc.roundedRect(x, y, cardWidth, 48, 5, 5, "F");
    doc.rect(x, y + 40, cardWidth, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(250, 204, 21);
    doc.text("BOWL VEGAS", x + 12, y + 17);
    doc.setFontSize(7);
    doc.setTextColor(230);
    doc.text("EMERGENCY ADMISSION PASS", x + 12, y + 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(`${index + 1} of ${passes.length}`, x + cardWidth - 12, y + 18, { align: "right" });

    doc.setTextColor(80);
    doc.setFontSize(7);
    doc.text("EVENT", x + 12, y + 63);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text(packetEventName, x + 12, y + 76, { maxWidth: cardWidth - 24 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(packetDateWindow, x + 12, y + 88, { maxWidth: cardWidth - 24 });

    doc.setTextColor(80);
    doc.text("BOWLER", x + 12, y + 112);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(fullName, x + 12, y + 131, { maxWidth: cardWidth - 24 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(`Bowler ID: ${pass.bowlerIdLabel || pass.bowlerId}`, x + 12, y + 144, { maxWidth: cardWidth - 24 });

    doc.setTextColor(80);
    doc.text("TEAM / CENTER", x + 12, y + 166);
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(team, x + 12, y + 180, { maxWidth: cardWidth - 24 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(65);
    doc.text(center, x + 12, y + 193, { maxWidth: cardWidth - 24 });

    const accessTop = y + 204;
    const boxGap = 8;
    const boxWidth = (cardWidth - 24 - boxGap) / 2;
    const drawAccess = (label: string, included: boolean, boxX: number, detail?: string) => {
      doc.setDrawColor(included ? 16 : 185, included ? 135 : 28, included ? 70 : 28);
      doc.setFillColor(included ? 236 : 245, included ? 253 : 245, included ? 245 : 245);
      doc.roundedRect(boxX, accessTop, boxWidth, 50, 3, 3, "FD");
      doc.setTextColor(included ? 15 : 115);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(label, boxX + 8, accessTop + 15);
      doc.setFontSize(8.5);
      doc.text(included ? "ELIGIBLE" : "NOT INCLUDED", boxX + 8, accessTop + 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      if (detail) doc.text(detail, boxX + 8, accessTop + 41, { maxWidth: boxWidth - 16 });
    };
    drawAccess("BANQUET", bool(pass.hasBanquetPass), x + 12, bool(pass.under21) ? "Under 21 — verify venue policy" : pass.banquetLocation || "Present at banquet door");
    drawAccess("POOL PARTY", bool(pass.poolPartyEnabled) && bool(pass.hasPoolPass), x + 12 + boxWidth + boxGap, bool(pass.poolPartyEnabled) ? (pass.poolPartyTime || "Present at pool door") : "Pool party not enabled");

    doc.setTextColor(80);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("GUESTS LINKED TO THIS BOWLER", x + 12, y + 270);
    doc.setTextColor(35);
    doc.setFontSize(8);
    const guestCount = Number(pass.guestCount ?? 0);
    const guestLine = guestCount > 0 ? `${guestCount} guest${guestCount === 1 ? "" : "s"}${pass.guestNames ? `: ${pass.guestNames}` : ""}` : "None listed";
    doc.text(guestLine, x + 12, y + 284, { maxWidth: cardWidth - 24 });

    const emergencyDividerY = y + cardHeight - 50;
    doc.setDrawColor(155);
    doc.setLineWidth(0.5);
    doc.line(x + 12, emergencyDividerY, x + cardWidth - 12, emergencyDividerY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(30);
    doc.text("EMERGENCY LOG", x + 12, emergencyDividerY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.text("Entry # __________   Time __________   Staff initials __________", x + 12, emergencyDividerY + 27, { maxWidth: cardWidth - 24 });
    doc.setTextColor(85);
    doc.setFontSize(5.6);
    doc.text("Use only if QR or app check-in is unavailable. Verify against the controlled roster and mark the door log.", x + 12, emergencyDividerY + 39, { maxWidth: cardWidth - 24 });
    doc.setTextColor(0);
  });

  doc.save(`${safeFilePart(packetEventName)}-Bowler-Admission-Passes.pdf`);
  return true;
}
