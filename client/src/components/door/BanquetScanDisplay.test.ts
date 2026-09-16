import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scanResultSource = readFileSync(fileURLToPath(new URL("./ScanResult.tsx", import.meta.url)), "utf8");
const scanLaneSource = readFileSync(fileURLToPath(new URL("./ScanLane.tsx", import.meta.url)), "utf8");
const bundleSource = readFileSync(fileURLToPath(new URL("../../../../server/offlineBundleGenerator.ts", import.meta.url)), "utf8");

describe("banquet QR scan display", () => {
  it("renders banquet identity and an explicit under-21 age restriction", () => {
    expect(scanResultSource).toContain('"BANQUET ENTRY"');
    expect(scanResultSource).toContain('"UNDER 21"');
    expect(scanResultSource).toContain("identity");
    expect(scanLaneSource).toContain("displayName={decision?.displayName}");
    expect(scanLaneSource).toContain("teamNumber={decision?.teamNumber}");
  });

  it("keeps the standalone offline scanner’s roster identity and age flag visible", () => {
    expect(bundleSource).toContain("decision.detail");
    expect(bundleSource).toContain("UNDER 21 · AGE RESTRICTION");
    expect(bundleSource).toContain("decision.under21");
  });
});
