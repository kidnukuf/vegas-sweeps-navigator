import { describe, expect, it } from "vitest";
import { isPassportTypeAllowedAtDoor, resolveDoorPassportScan } from "@shared/doorPassportScan";

describe("shared self-scan door passport resolution", () => {
  it("recognizes bowler and guest QR URLs through the same scanner input", () => {
    expect(resolveDoorPassportScan("https://www.bowlvegas.com/scan/pool/BOWLER-123", "pool")).toEqual({ tokenValue: "BOWLER-123", passportType: "pool" });
    expect(resolveDoorPassportScan("https://www.bowlvegas.com/scan/guest-banquet/GUEST-A", "banquet")).toEqual({ tokenValue: "GUEST-A", passportType: "guest-banquet" });
  });

  it("uses the selected door for a bare scanner token and never permits the wrong door type", () => {
    expect(resolveDoorPassportScan("  RAW-TOKEN  ", "banquet")).toEqual({ tokenValue: "RAW-TOKEN", passportType: "banquet" });
    expect(isPassportTypeAllowedAtDoor("pool", "pool")).toBe(true);
    expect(isPassportTypeAllowedAtDoor("guest-pool", "pool")).toBe(true);
    expect(isPassportTypeAllowedAtDoor("banquet", "pool")).toBe(false);
    expect(isPassportTypeAllowedAtDoor("guest-banquet", "pool")).toBe(false);
  });
});
