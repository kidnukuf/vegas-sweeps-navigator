import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routerSource = readFileSync(fileURLToPath(new URL("./routers/bowlerAuth.ts", import.meta.url)), "utf8");
const panelSource = readFileSync(fileURLToPath(new URL("../client/src/components/QrBusinessCardPacketPanel.tsx", import.meta.url)), "utf8");
const reprintSource = readFileSync(fileURLToPath(new URL("../client/src/components/QrBusinessCardReprintPanel.tsx", import.meta.url)), "utf8");
const adminSource = readFileSync(fileURLToPath(new URL("../client/src/pages/AdminDashboard.tsx", import.meta.url)), "utf8");
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

  it("scopes center, team, and one-bowler batches on the server before card URLs are returned", () => {
    expect(routerSource).toContain("centerId: z.number().int().positive().optional()");
    expect(routerSource).toContain("teamId: z.number().int().positive().optional()");
    expect(routerSource).toContain("bowlerId: z.number().int().positive().optional()");
    expect(routerSource).toContain("if (input.bowlerId) await assertBowlerAccess(ctx, input.bowlerId)");
    expect(routerSource).toContain('whereParts.push("b.centerId = ?")');
    expect(routerSource).toContain('whereParts.push("b.teamId = ?")');
    expect(routerSource).toContain('whereParts.push("b.id = ?")');
    expect(routerSource).toContain("WHERE ${whereClause}");
    expect(routerSource).toContain("availableCenters");
    expect(routerSource).toContain("availableTeams");
  });

  it("offers Director center and team batch controls plus a selected-bowler reprint option", () => {
    expect(panelSource).toContain("All event centers");
    expect(panelSource).toContain("All teams");
    expect(panelSource).toContain("Download selected batch");
    expect(panelSource).toContain("Print selected batch");
    expect(panelSource).toContain("filters run on the server before QR URLs are returned");
    expect(reprintSource).toContain("bowlerId");
    expect(reprintSource).toContain("Reprint");
    expect(reprintSource).toContain("No QR credential is regenerated or changed");
    expect(adminSource).toContain("QrBusinessCardReprintPanel");
  });

  it("provides standard DIY business-card PDF and print actions", () => {
    expect(panelSource).toContain("3.5 × 2-inch");
    expect(pdfSource).toContain("CARD_WIDTH = 3.5 * POINTS_PER_INCH");
    expect(pdfSource).toContain("CARD_HEIGHT = 2 * POINTS_PER_INCH");
    expect(pdfSource).toContain("CARDS_PER_PAGE = 10");
    expect(pdfSource).toContain("BOWL");
    expect(pdfSource).toContain("VEGAS");
    expect(pdfSource).toContain("batchLabel");
  });
});
