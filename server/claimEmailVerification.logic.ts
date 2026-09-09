import crypto from "crypto";

export const CLAIM_VERIFICATION_TTL_MS = 15 * 60 * 1000;
export const CLAIM_RESEND_COOLDOWN_MS = 60 * 1000;

export type ClaimVerificationStatus = "pending" | "verified" | "consumed" | "expired" | "revoked";

export function normalizeClaimEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashClaimEmail(email: string): string {
  return sha256(normalizeClaimEmail(email));
}

export function generateOpaqueVerificationToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function isClaimVerificationExpired(expiresAt: number, now = Date.now()): boolean {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function canCompleteClaim(status: ClaimVerificationStatus, expiresAt: number, now = Date.now()): boolean {
  return status === "verified" && !isClaimVerificationExpired(expiresAt, now);
}

/**
 * Builds a link that contains only the opaque, email-delivered capability token.
 * Name, email, claim code, and other roster information never appear in the URL.
 */
export function buildClaimVerificationUrl(origin: string, token: string): string {
  const url = new URL("/claim/verify", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
