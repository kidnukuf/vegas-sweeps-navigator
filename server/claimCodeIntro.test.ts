import { describe, expect, it } from "vitest";
import { CLAIM_CODE_INTRODUCTION_URL, getClaimCodeIntroductionUrl } from "../client/src/lib/claimCodeLinks";

describe("printed claim-code QR destination", () => {
  it("uses the public bowler and captain introduction page", () => {
    expect(CLAIM_CODE_INTRODUCTION_URL).toBe("https://www.bowlvegas.com/get-started");
  });

  it("carries the printed card's source event without exposing the event name in the URL", () => {
    expect(getClaimCodeIntroductionUrl(1980003)).toBe("https://www.bowlvegas.com/get-started?event=1980003");
  });

  it("carries the recipient's printed claim code into the introduction journey", () => {
    expect(getClaimCodeIntroductionUrl(1980003, "bob-4z9")).toBe("https://www.bowlvegas.com/get-started?event=1980003&claimCode=BOB-4Z9");
  });
});
