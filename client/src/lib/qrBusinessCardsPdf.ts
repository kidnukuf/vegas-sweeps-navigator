import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type QrBusinessCardRecord = {
  cardId: string;
  bowlerId: number;
  attendeeName: string;
  attendeeType: "bowler" | "guest";
  passType: "banquet" | "pool";
  qrUrl: string;
  under21: boolean;
  hostName?: string | null;
  centerId?: number | null;
  centerName?: string | null;
  teamId?: number | null;
  teamName?: string | null;
};

export type QrBusinessCardsOptions = {
  eventName: string;
  eventId: number;
  batchLabel?: string | null;
};

const POINTS_PER_INCH = 72;
const CARD_WIDTH = 3.5 * POINTS_PER_INCH;
const CARD_HEIGHT = 2 * POINTS_PER_INCH;
const CARDS_PER_PAGE = 10;

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "BowlVegas";
}

function passLabel(passType: QrBusinessCardRecord["passType"]) {
  return passType === "banquet" ? "BANQUET DINNER" : "POOL PARTY";
}

function passAccent(passType: QrBusinessCardRecord["passType"]) {
  return passType === "banquet" ? [255, 191, 36] as const : [34, 211, 238] as const;
}

function drawBowlVegasWordmark(doc: jsPDF, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  doc.setTextColor(77, 224, 255);
  doc.text("BOWL", x, y);
  const bowlWidth = doc.getTextWidth("BOWL");
  doc.setTextColor(255, 197, 46);
  doc.text("VEGAS", x + bowlWidth + 1.5, y);
}

function drawBusinessCard(
  doc: jsPDF,
  record: QrBusinessCardRecord,
  x: number,
  y: number,
  qrDataUrl: string,
  eventName: string,
) {
  const accent = passAccent(record.passType);
  const qrSize = 91;
  const qrX = x + 12;
  const qrY = y + 34;
  const contentX = qrX + qrSize + 12;
  const contentWidth = CARD_WIDTH - (contentX - x) - 11;

  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT, "F");
  doc.setDrawColor(107, 114, 128);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT, "S");
  doc.setLineDashPattern([], 0);

  doc.setFillColor(13, 20, 38);
  doc.rect(x, y, CARD_WIDTH, 25, "F");
  drawBowlVegasWordmark(doc, x + 11, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  doc.setTextColor(196, 205, 221);
  const eventLine = doc.splitTextToSize(eventName || "BowlVegas Event", CARD_WIDTH - 118)[0] || "BowlVegas Event";
  doc.text(eventLine, x + CARD_WIDTH - 11, y + 16, { align: "right" });

  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.roundedRect(contentX, y + 35, contentWidth, 16, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(13, 20, 38);
  doc.text(passLabel(record.passType), contentX + contentWidth / 2, y + 45.5, { align: "center" });

  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(19, 28, 45);
  const nameLines = doc.splitTextToSize(record.attendeeName, contentWidth).slice(0, 2);
  doc.text(nameLines, contentX, y + 65, { maxWidth: contentWidth });

  const nameBlockHeight = nameLines.length * 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.setTextColor(60, 72, 90);
  doc.text(record.attendeeType === "guest" ? "GUEST PASS" : "BOWLER PASS", contentX, y + 72 + nameBlockHeight);

  let detailY = y + 83 + nameBlockHeight;
  if (record.hostName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.4);
    doc.setTextColor(85, 95, 112);
    const hostLine = doc.splitTextToSize(`Guest of ${record.hostName}`, contentWidth).slice(0, 2);
    doc.text(hostLine, contentX, detailY, { maxWidth: contentWidth });
    detailY += hostLine.length * 6.2 + 2;
  }
  if (record.under21) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(185, 28, 28);
    doc.text("UNDER 21", contentX, Math.min(detailY, y + 119));
  }

  doc.setFillColor(241, 245, 249);
  doc.rect(x, y + CARD_HEIGHT - 16, CARD_WIDTH, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.4);
  doc.setTextColor(30, 41, 59);
  doc.text("Scan at the designated event entrance", x + 11, y + CARD_HEIGHT - 6);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text("BowlVegas.com", x + CARD_WIDTH - 11, y + CARD_HEIGHT - 6, { align: "right" });
}

export async function createQrBusinessCardsPdf(records: QrBusinessCardRecord[], options: QrBusinessCardsOptions) {
  const cards = records.filter((record) => record.qrUrl && record.attendeeName);
  if (cards.length === 0) return null;
  const headerLabel = [options.eventName, options.batchLabel].filter(Boolean).join(" · ");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const horizontalMargin = (pageWidth - CARD_WIDTH * 2) / 2;
  const verticalMargin = (pageHeight - CARD_HEIGHT * 5) / 2;

  for (let index = 0; index < cards.length; index += 1) {
    if (index > 0 && index % CARDS_PER_PAGE === 0) doc.addPage();
    const position = index % CARDS_PER_PAGE;
    const column = position % 2;
    const row = Math.floor(position / 2);
    const x = horizontalMargin + column * CARD_WIDTH;
    const y = verticalMargin + row * CARD_HEIGHT;
    const qrDataUrl = await QRCode.toDataURL(cards[index].qrUrl, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "H",
    });
    drawBusinessCard(doc, cards[index], x, y, qrDataUrl, headerLabel);
  }

  return doc;
}

export async function downloadQrBusinessCards(records: QrBusinessCardRecord[], options: QrBusinessCardsOptions) {
  const doc = await createQrBusinessCardsPdf(records, options);
  if (!doc) return false;
  doc.save(`${safeFilePart([options.eventName, options.batchLabel].filter(Boolean).join("-"))}-QR-Business-Cards.pdf`);
  return true;
}

export async function printQrBusinessCards(records: QrBusinessCardRecord[], options: QrBusinessCardsOptions) {
  const doc = await createQrBusinessCardsPdf(records, options);
  if (!doc) return false;
  const blobUrl = URL.createObjectURL(doc.output("blob"));
  const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    doc.save(`${safeFilePart([options.eventName, options.batchLabel].filter(Boolean).join("-"))}-QR-Business-Cards.pdf`);
    return true;
  }
  window.setTimeout(() => {
    try { printWindow.focus(); printWindow.print(); } catch { /* The PDF viewer remains available. */ }
  }, 900);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return true;
}
