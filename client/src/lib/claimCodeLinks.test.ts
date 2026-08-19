import { describe, expect, it } from "vitest";
import { CLAIM_CODE_INTRODUCTION_URL } from "./claimCodeLinks";

describe("claim-code print QR destination", () => {
  it("routes recipients to the public orientation page", () => {
    expect(CLAIM_CODE_INTRODUCTION_URL).toBe("https://www.bowlvegas.com/get-started");
  });
});
