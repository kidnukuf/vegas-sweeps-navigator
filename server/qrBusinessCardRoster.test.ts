import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routerSource = readFileSync(fileURLToPath(new URL("./routers/bowlerAuth.ts", import.meta.url)), "utf8");
const panelSource = readFileSync(fileURLToPath(new URL("../client/src/components/QrBusinessCardPacketPanel.tsx", import.meta.url)), "utf8");
const pdfSource = readFileSync(fileURLToPath(new URL("../client/src/lib/qrBusinessCardsPdf.ts", import.meta.url)), "utf8");

describe("Event Director QR business cards", () => {
  it("uses an authorized event roster and current stored bowler and guest passes", () => {
    expect(routerSource).toContain("getQrBusinessCardRoster");
    expect(routerSource).toContain("await requireEventDirectorToolAccess(ctx, input.token)");
    expect(routerSource).toContain("await assertEventAccess(ctx, input.eventId)");
    expect(routerSource).toContain("g.disabled = 0");
    expect(routerSource).toContain("!guest.token.endsWith(\"-BQ\")");
    expect(routerSource).toContain("!row.banquetUsed");
    expect(routerSource).toContain("!row.poolPartyUsed");
  });

  it("provides standard DIY business-card PDF and print actions", () => {
    expect(panelSource).toContain("Download QR Business Card PDF");
    expect(panelSource).toContain("Print QR Business Cards");
    expect(panelSource).toContain("3.5 × 2-inch");
    expect(pdfSource).toContain("CARD_WIDTH = 3.5 * POINTS_PER_INCH");
    expect(pdfSource).toContain("CARD_HEIGHT = 2 * POINTS_PER_INCH");
    expect(pdfSource).toContain("CARDS_PER_PAGE = 10");
    expect(pdfSource).toContain("BOWL");
    expect(pdfSource).toContain("VEGAS");
  });
});
