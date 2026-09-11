import { describe, expect, it } from "vitest";
import { isLikelyOfflineScannerToken, OFFLINE_SCANNER_MIN_TOKEN_LENGTH, scannerInputInstruction } from "./offlineScannerInput";

describe("offline scanner keyboard input", () => {
  it("accepts the token formats used by offline door passes", () => {
    expect(isLikelyOfflineScannerToken("0901261102")).toBe(true);
    expect(isLikelyOfflineScannerToken("0901261102A")).toBe(true);
    expect(isLikelyOfflineScannerToken("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isLikelyOfflineScannerToken("RE-BQ-main-1980003-001")).toBe(true);
  });

  it("does not steal short manual text from the input fields", () => {
    expect(isLikelyOfflineScannerToken("1234567")).toBe(false);
    expect(OFFLINE_SCANNER_MIN_TOKEN_LENGTH).toBe(8);
  });

  it("explains that Scanner A does not require cursor placement", () => {
    expect(scannerInputInstruction()).toMatch(/globally/i);
    expect(scannerInputInstruction()).toMatch(/no mouse/i);
  });
});
