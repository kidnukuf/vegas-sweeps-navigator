/** Base public orientation page reached by every printable claim-code QR card. */
export const CLAIM_CODE_INTRODUCTION_URL = "https://www.bowlvegas.com/get-started";

/**
 * Carries only the event identifier in the QR URL. The page resolves the event
 * name server-side rather than trusting an editable name in the query string.
 */
export function getClaimCodeIntroductionUrl(eventId: number) {
  return `${CLAIM_CODE_INTRODUCTION_URL}?event=${encodeURIComponent(String(eventId))}`;
}
