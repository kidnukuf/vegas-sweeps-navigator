import { describe, expect, it } from "vitest";
import { formatPassportScannerName } from "./passportDisplay";

describe("formatPassportScannerName", () => {
  it("adds a prominent age-status cue for an under-21 banquet pass", () => {
    expect(formatPassportScannerName("Jordan Bowler", true, true)).toBe(
      "Jordan Bowler — UNDER 21"
    );
  });

  it("does not add an age-status cue to pool-party scans or age-21-and-over banquet passes", () => {
    expect(formatPassportScannerName("Jordan Bowler", true, false)).toBe("Jordan Bowler");
    expect(formatPassportScannerName("Jordan Bowler", false, true)).toBe("Jordan Bowler");
  });
});
