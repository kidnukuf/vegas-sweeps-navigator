/**
 * Appends the age-status cue required by banquet door staff without changing
 * pool-party scans or the source name stored in the database.
 */
export function formatPassportScannerName(
  displayName: string,
  under21: boolean,
  isBanquet: boolean
): string {
  return under21 && isBanquet ? `${displayName} — UNDER 21` : displayName;
}
