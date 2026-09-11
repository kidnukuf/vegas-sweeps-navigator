import { describe, expect, it } from "vitest";
import { getClaimCardInstructionLines } from "./claimCardLayout";

describe("claim-code card instructions", () => {
  it("returns two self-contained lines for each cut-out card", () => {
    const lines = getClaimCardInstructionLines();

    expect(lines).toEqual([
      "Scan QR to create account.",
      "Enter your claim code to finish.",
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length <= 34)).toBe(true);
    expect(lines.every((line) => !line.includes("→"))).toBe(true);
  });
});
