import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type BanquetQrPacketRecord = {
  bowlerId: number;
  firstName: string;
  lastName: string;
  scantronId?: string | null;
  banquetToken: string;
  banquetUrl: string;
  banquetUsed: boolean;
  under21: boolean;
  centerName?: string | null;
  teamName?: string | null;
};

export type BanquetQrPacketOptions = {
  eventName: string;
  eventId: number;
  dateWindow?: string;
};

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Bowl-Vegas";
}

function drawCard(
  doc: jsPDF,
  record: BanquetQrPacketRecord,
  index: number,
  total: number,
  x: number,
  y: number,
  width: number,
  height: number,
  qrDataUrl?: string,
  back = false,
) {
  doc.setDrawColor(85);
  doc.setLineWidth(0.7);
  doc.roundedRect(x, y, width, height, 4, 4, "S");
  doc.setFillColor(back ? 240 : 12, back ? 243 : 25, back ? 247 : 42);
  doc.roundedRect(x, y, width, 28, 4, 4, "F");
  doc.rect(x, y + 20, width, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(back ? 20 : 255, back ? 35 : 215, back ? 45 : 0);
  doc.text("BOWL VEGAS · BANQUET", x + 8, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text(`${index + 1} / ${total}`, x + width - 8, y + 12, { align: "right" });

  const fullName = `${record.firstName} ${record.lastName}`.trim();
  doc.setTextColor(25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(fullName, x + 8, y + 44, { maxWidth: width - 16 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.3);
  doc.setTextColor(85);
  doc.text(`Event ID ${record.bowlerId} · Scantron ${record.scantronId || "—"}`, x + 8, y + 55, { maxWidth: width - 16 });
  doc.text(String(record.teamName || record.centerName || "Roster record"), x + 8, y + 66, { maxWidth: width - 16 });

  if (back) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(record.under21 ? 160 : 35, record.under21 ? 30 : 100, record.under21 ? 30 : 55);
    doc.text(record.under21 ? "UNDER 21 — VERIFY AGE STATUS" : "BANQUET ENTRY PASS", x + 8, y + 90, { maxWidth: width - 16 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(75);
    doc.text("Back of matching banquet QR card", x + 8, y + height - 22);
    return;
  }

  if (qrDataUrl) {
    const qrSize = Math.min(width - 38, height - 112);
    doc.addImage(qrDataUrl, "PNG", x + (width - qrSize) / 2, y + 76, qrSize, qrSize);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(record.under21 ? 160 : 35, record.under21 ? 30 : 100, record.under21 ? 30 : 55);
  doc.text(record.under21 ? "UNDER 21 — VERIFY AGE STATUS" : "BANQUET QR · SCAN AT BANQUET ENTRY", x + 8, y + height - 20, { maxWidth: width - 16 });
}

export async function createBanquetQrPacketPdf(records: BanquetQrPacketRecord[], options: BanquetQrPacketOptions) {
  const codes = records.filter((record) => record.banquetToken && record.banquetUrl);
  if (codes.length === 0) return null;

  const qrDataUrls = await Promise.all(codes.map((record) => QRCode.toDataURL(record.banquetUrl, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: "H",
  })));

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;
  const gap = 7;
  const headerHeight = 34;
  const columns = 3;
  const rows = 4;
  const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
  const cardHeight = (pageHeight - margin * 2 - headerHeight - gap * (rows - 1)) / rows;
  const sheets = Math.ceil(codes.length / 12);

  const drawHeader = (pageNumber: number, side: "FRONT" | "BACK") => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(`${options.eventName} — Banquet QR Roster`, margin, 15, { maxWidth: pageWidth - margin * 2 - 80 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.setTextColor(80);
    doc.text(`Event ID ${options.eventId} · ${side} · ${options.dateWindow || "Use current event dates"} · Duplex: flip on long edge`, margin, 25, { maxWidth: pageWidth - margin * 2 - 80 });
    doc.text(`${pageNumber} / ${sheets} · ${codes.length} banquet codes`, pageWidth - margin, 15, { align: "right" });
  };

  for (let sheet = 0; sheet < sheets; sheet += 1) {
    const start = sheet * 12;
    const pageCodes = codes.slice(start, start + 12);
    if (sheet > 0) doc.addPage();
    drawHeader(sheet + 1, "FRONT");
    for (let slot = 0; slot < pageCodes.length; slot += 1) {
      const col = slot % columns;
      const row = Math.floor(slot / columns);
      const x = margin + col * (cardWidth + gap);
      const y = margin + headerHeight + row * (cardHeight + gap);
      drawCard(doc, pageCodes[slot], start + slot, codes.length, x, y, cardWidth, cardHeight, qrDataUrls[start + slot], false);
    }

    doc.addPage();
    drawHeader(sheet + 1, "BACK");
    for (let slot = 0; slot < pageCodes.length; slot += 1) {
      const col = slot % columns;
      const row = Math.floor(slot / columns);
      const x = margin + (columns - 1 - col) * (cardWidth + gap);
      const y = margin + headerHeight + row * (cardHeight + gap);
      drawCard(doc, pageCodes[slot], start + slot, codes.length, x, y, cardWidth, cardHeight, undefined, true);
    }
  }

  return doc;
}

export async function downloadBanquetQrPacket(records: BanquetQrPacketRecord[], options: BanquetQrPacketOptions) {
  const doc = await createBanquetQrPacketPdf(records, options);
  if (!doc) return false;
  doc.save(`${safeFilePart(options.eventName)}-Banquet-QR-Roster.pdf`);
  return true;
}

export async function printBanquetQrPacket(records: BanquetQrPacketRecord[], options: BanquetQrPacketOptions) {
  const doc = await createBanquetQrPacketPdf(records, options);
  if (!doc) return false;
  const blobUrl = URL.createObjectURL(doc.output("blob"));
  const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    doc.save(`${safeFilePart(options.eventName)}-Banquet-QR-Roster.pdf`);
    return true;
  }
  window.setTimeout(() => {
    try { printWindow.focus(); printWindow.print(); } catch { /* PDF viewer controls remain available. */ }
  }, 900);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return true;
}
