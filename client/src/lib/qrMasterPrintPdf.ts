import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { QrBusinessCardRecord } from "./qrBusinessCardsPdf";

export type QrMasterPrintRecord = QrBusinessCardRecord & {
  leagueId?: number | null;
  leagueName?: string | null;
  leagueCode?: string | null;
  teamCode?: string | null;
  isCaptain?: boolean;
  used?: boolean;
  guestSuffix?: string | null;
};
export type QrMasterPrintOptions = {
  eventId: number;
  eventName: string;
  onProgress?: (completed: number, total: number) => void;
};

const alphabetic = new Intl.Collator("en", { sensitivity: "base" });
const numeric = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const WIDTH = 252;
const HEIGHT = 144;
const PER_PAGE = 10;
const label = (value?: string | null) => value?.trim() || "";
const compareKnown = (a: string, b: string, comparator = alphabetic) =>
  a && b ? comparator.compare(a, b) : a ? -1 : b ? 1 : 0;

export function sortQrMasterPrintRecords(records: QrMasterPrintRecord[]) {
  return [...records].sort((a, b) =>
    compareKnown(label(a.centerName), label(b.centerName)) ||
    compareKnown(label(a.leagueName) || label(a.leagueCode), label(b.leagueName) || label(b.leagueCode), numeric) ||
    compareKnown(label(a.leagueCode), label(b.leagueCode), numeric) ||
    (a.leagueId ?? Number.MAX_SAFE_INTEGER) - (b.leagueId ?? Number.MAX_SAFE_INTEGER) ||
    compareKnown(label(a.teamCode), label(b.teamCode), numeric) ||
    (a.teamId ?? Number.MAX_SAFE_INTEGER) - (b.teamId ?? Number.MAX_SAFE_INTEGER) ||
    alphabetic.compare(label(a.hostName) || a.attendeeName, label(b.hostName) || b.attendeeName) ||
    a.bowlerId - b.bowlerId ||
    (a.attendeeType === "guest" ? 1 : 0) - (b.attendeeType === "guest" ? 1 : 0) ||
    numeric.compare(label(a.guestSuffix), label(b.guestSuffix)) ||
    alphabetic.compare(a.attendeeName, b.attendeeName) ||
    alphabetic.compare(a.passType, b.passType) ||
    numeric.compare(a.cardId, b.cardId),
  );
}

export function masterPrintNames(record: QrMasterPrintRecord): string[] {
  if (record.attendeeType !== "guest") return [record.attendeeName];
  const guest = record.attendeeName.trim();
  return [record.hostName?.trim() || "Host name not provided", /^Guest Pass(?:\s|$)/i.test(guest) ? guest : `Guest: ${guest}`];
}

function drawFittedLines(doc: jsPDF, lines: string[], x: number, y: number, width: number, height: number, maxFont = 9.5) {
  let size = maxFont;
  let wrapped: string[] = [];
  // Fit the complete names; do not truncate them with slice or an ellipsis.
  while (size > 3) {
    doc.setFontSize(size);
    wrapped = lines.flatMap(line => doc.splitTextToSize(line, width) as string[]);
    if (wrapped.length * size * 1.12 <= height) break;
    size -= 0.25;
  }
  doc.setFontSize(size);
  doc.text(wrapped, x, y, { lineHeightFactor: 1.12 });
}

function drawCard(doc: jsPDF, record: QrMasterPrintRecord, x: number, y: number, qr: string) {
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, WIDTH, HEIGHT, "F");
  doc.setDrawColor(190, 196, 207);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(x, y, WIDTH, HEIGHT, "S");
  doc.setLineDashPattern([], 0);
  doc.setFillColor(13, 20, 38);
  doc.rect(x, y, WIDTH, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  doc.setTextColor(77, 224, 255);
  doc.text("BOWL", x + 10, y + 15);
  const bowlWidth = doc.getTextWidth("BOWL");
  doc.setTextColor(255, 197, 46);
  doc.text("VEGAS", x + 11.5 + bowlWidth, y + 15);
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(record.passType === "banquet" ? "BANQUET DINNER" : "POOL PARTY", x + WIDTH - 10, y + 14, { align: "right" });
  // Encode and print the supplied portal URL, never a replacement credential.
  doc.addImage(qr, "PNG", x + 9, y + 32, 94, 94);
  const textX = x + 112;
  const textWidth = WIDTH - 122;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(54, 65, 83);
  const role = record.attendeeType === "guest" ? "GUEST PASS" : record.isCaptain ? "TEAM CAPTAIN" : "BOWLER";
  doc.text(role, textX, y + 34);
  doc.setTextColor(13, 20, 38);
  drawFittedLines(doc, masterPrintNames(record), textX, y + 48, textWidth, 47);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(66, 77, 94);
  const group = [
    `Center: ${label(record.centerName) || "Not assigned"}`,
    `League: ${label(record.leagueName) || (label(record.leagueCode) ? `Code ${record.leagueCode}` : "Not assigned")}`,
    `Team #: ${label(record.teamCode) || "Not assigned"}`,
  ];
  drawFittedLines(doc, group, textX, y + 96, textWidth, 31, 6.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.7);
  doc.setTextColor(record.used || record.under21 ? 185 : 46, record.used || record.under21 ? 28 : 61, record.used || record.under21 ? 28 : 79);
  const flags = [record.used ? "ALREADY REDEEMED - NOT VALID FOR REENTRY" : "SINGLE-USE PASS", record.under21 ? "UNDER 21" : null].filter(Boolean).join(" | ");
  doc.text(flags, x + 9, y + 137);
}

export async function createQrMasterPrintPdf(records: QrMasterPrintRecord[], options: QrMasterPrintOptions) {
  const cards = sortQrMasterPrintRecords(records.filter(card => card.qrUrl));
  if (!cards.length) return null;
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = (pageWidth - WIDTH * 2) / 2;
  const top = (pageHeight - HEIGHT * 5) / 2;
  const pages = Math.ceil(cards.length / PER_PAGE);
  for (let index = 0; index < cards.length; index++) {
    if (index > 0 && index % PER_PAGE === 0) doc.addPage();
    if (index % PER_PAGE === 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(32, 43, 60);
      drawFittedLines(doc, [`QR CODE MASTER PRINT | ${options.eventName}`], left, 17, pageWidth - left * 2, 10, 8);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(75, 85, 99);
      doc.text("Center A-Z > League > Team number | Exact stored QR codes | Print at 100% / Actual size", left, 27);
      doc.text(`Event ${options.eventId} | ${cards.length} QR codes | Page ${Math.floor(index / PER_PAGE) + 1} of ${pages}`, left, pageHeight - 18);
    }
    const position = index % PER_PAGE;
    const qr = await QRCode.toDataURL(cards[index].qrUrl, { width: 480, margin: 4, errorCorrectionLevel: "H" });
    drawCard(doc, cards[index], left + (position % 2) * WIDTH, top + Math.floor(position / 2) * HEIGHT, qr);
    options.onProgress?.(index + 1, cards.length);
    // Allow the browser to paint progress during large-event exports.
    if ((index + 1) % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return doc;
}

export async function downloadQrMasterPrint(records: QrMasterPrintRecord[], options: QrMasterPrintOptions) {
  const doc = await createQrMasterPrintPdf(records, options);
  if (!doc) return false;
  const name = options.eventName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "BowlVegas";
  doc.save(`${name}-QR-Code-Master-Print.pdf`);
  return true;
}
