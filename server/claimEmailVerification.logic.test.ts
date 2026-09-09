import { describe, expect, it } from "vitest";
import {
  CLAIM_VERIFICATION_TTL_MS,
  buildClaimVerificationUrl,
  canCompleteClaim,
  generateOpaqueVerificationToken,
  hashClaimEmail,
  isClaimVerificationExpired,
  normalizeClaimEmail,
  sha256,
} from "./claimEmailVerification.logic";

describe("claim email verification primitives", () => {
  it("normalizes email values before hashing", () => {
    expect(normalizeClaimEmail("  Bowler@Example.test ")).toBe("bowler@example.test");
    expect(hashClaimEmail("Bowler@Example.test")).toBe(hashClaimEmail(" bowler@example.test "));
  });

  it("creates opaque high-entropy tokens and persists only their digest", () => {
    const first = generateOpaqueVerificationToken();
    const second = generateOpaqueVerificationToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.tokenHash).toBe(sha256(first.token));
    expect(first.tokenHash).not.toContain(first.token);
  });

  it("rejects expired, pending, consumed, and revoked verification states", () => {
    const now = 1_700_000_000_000;
    expect(isClaimVerificationExpired(now - 1, now)).toBe(true);
    expect(isClaimVerificationExpired(now + CLAIM_VERIFICATION_TTL_MS, now)).toBe(false);
    expect(canCompleteClaim("verified", now + 1, now)).toBe(true);
    expect(canCompleteClaim("pending", now + 1, now)).toBe(false);
    expect(canCompleteClaim("consumed", now + 1, now)).toBe(false);
    expect(canCompleteClaim("revoked", now + 1, now)).toBe(false);
  });

  it("builds a verification URL with no roster data", () => {
    const url = buildClaimVerificationUrl("https://www.bowlvegas.com", "opaque-token");
    expect(url).toBe("https://www.bowlvegas.com/claim/verify?token=opaque-token");
    expect(url).not.toContain("email");
    expect(url).not.toContain("claimCode");
  });
});
