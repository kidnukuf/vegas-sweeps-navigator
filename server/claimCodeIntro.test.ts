import { describe, expect, it } from "vitest";
import { CLAIM_CODE_INTRODUCTION_URL } from "../client/src/lib/claimCodeLinks";

describe("printed claim-code QR destination", () => {
  it("uses the public bowler and captain introduction page", () => {
    expect(CLAIM_CODE_INTRODUCTION_URL).toBe("https://www.bowlvegas.com/get-started");
  });
});
