/**
 * Pure, dependency-free logic shared by client and server for the B.O.B.
 * Roll-off Passport. Kept side-effect free so it can be unit tested directly.
 */

export type AdTier = "bronze" | "silver" | "gold";

export const TIER_WEIGHT: Record<AdTier, number> = {
  gold: 4,
  silver: 2,
  bronze: 1,
};

/**
 * Build a guest ID from a bowler's 10-digit scantron ID plus a zero-based
 * guest index: 0 -> "A", 1 -> "B", ... 25 -> "Z", 26 -> "AA".
 */
export function guestIdFor(scantronId: string, guestIndex: number): string {
  return `${scantronId}${guestSuffix(guestIndex)}`;
}

/** Convert a zero-based index to an alphabetic suffix (A, B, ..., Z, AA, AB...). */
export function guestSuffix(guestIndex: number): string {
  if (guestIndex < 0) throw new Error("guestIndex must be >= 0");
  let n = guestIndex;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Derive how many guest entitlements a monetary purchase column represents.
 * Pool party guests are $15 each; banquet guests are $80 each. A plain "Y"/"1"
 * (already coerced to the unit price by the importer) yields 1.
 */
export function guestCountFromAmount(amount: number, unitPrice: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || unitPrice <= 0) return 0;
  return Math.floor(amount / unitPrice);
}

/**
 * Expand a list of ads into a tier-weighted playlist. Gold appears 4x, Silver
 * 2x, Bronze 1x — giving each tier twice the share-of-voice of the one below.
 */
export function buildWeightedPlaylist<T extends { tier: AdTier }>(ads: T[]): T[] {
  const out: T[] = [];
  for (const ad of ads) {
    const w = TIER_WEIGHT[ad.tier] ?? 1;
    for (let i = 0; i < w; i++) out.push(ad);
  }
  return out;
}

/**
 * The post-event survey is available only when the event has the survey feature
 * enabled AND the director has opened it (typically after the banquet concludes),
 * and the bowler has not already submitted.
 */
export function isSurveyAvailable(params: {
  surveyEnabled: boolean;
  surveyOpen: boolean;
  alreadySubmitted: boolean;
}): boolean {
  return params.surveyEnabled && params.surveyOpen && !params.alreadySubmitted;
}
