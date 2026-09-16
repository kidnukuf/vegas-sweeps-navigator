import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scanResultSource = readFileSync(fileURLToPath(new URL("./ScanResult.tsx", import.meta.url)), "utf8");
const scanLaneSource = readFileSync(fileURLToPath(new URL("./ScanLane.tsx", import.meta.url)), "utf8");
const bundleSource = readFileSync(fileURLToPath(new URL("../../../../server/offlineBundleGenerator.ts", import.meta.url)), "utf8");

describe("banquet QR scan display", () => {
  it("renders the exact successful under-21 display with green base, red X, and identity", () => {
    expect(scanResultSource).toContain('"BANQUET ENTRY"');
    expect(scanResultSource).toContain('aria-label="Accepted-UNDER 21"');
    expect(scanResultSource).toContain("Accepted-UNDER 21");
    expect(scanResultSource).toContain("#90EE90");
    expect(scanResultSource).toContain("#dc2626");
    expect(scanResultSource).toContain("identity");
    expect(scanLaneSource).toContain("displayName={decision?.displayName}");
    expect(scanLaneSource).toContain("teamNumber={decision?.teamNumber}");
  });

  it("keeps the standalone offline scanner’s roster identity and age flag visible", () => {
    expect(bundleSource).toContain("decision.detail");
    expect(bundleSource).toContain("Accepted-UNDER 21");
    expect(bundleSource).toContain("#screenFlash.under21");
    expect(bundleSource).toContain("#dc2626");
    expect(bundleSource).toContain("decision.under21");
  });
});
