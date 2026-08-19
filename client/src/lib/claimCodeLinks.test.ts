import { describe, expect, it } from "vitest";
import { CLAIM_CODE_INTRODUCTION_URL, getClaimCodeIntroductionUrl } from "./claimCodeLinks";

describe("claim-code print QR destination", () => {
  it("routes recipients to the public orientation page", () => {
    expect(CLAIM_CODE_INTRODUCTION_URL).toBe("https://www.bowlvegas.com/get-started");
  });

  it("includes the source event identifier in printable QR links", () => {
    expect(getClaimCodeIntroductionUrl(1980003)).toBe("https://www.bowlvegas.com/get-started?event=1980003");
  });
});
