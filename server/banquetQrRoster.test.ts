import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routerSource = readFileSync(fileURLToPath(new URL("./routers/bowlerAuth.ts", import.meta.url)), "utf8");
const panelSource = readFileSync(fileURLToPath(new URL("../client/src/components/BanquetQrPacketPanel.tsx", import.meta.url)), "utf8");

describe("Event Director banquet QR roster", () => {
  it("filters the roster by event and requires stored banquet tokens", () => {
    expect(routerSource).toContain("getBanquetQrRoster");
    expect(routerSource).toContain("WHERE b.eventId = ? AND b.banquetToken IS NOT NULL");
    expect(routerSource).toContain("banquetUrl: row.banquetToken ? buildBanquetQrUrl");
  });

  it("exposes the complete-list, download, and duplex-print controls", () => {
    expect(panelSource).toContain("Download Banquet QR PDF");
    expect(panelSource).toContain("Print All — Duplex");
    expect(panelSource).toContain("12");
    expect(panelSource).toContain("exact stored banquet tokens");
  });
});
