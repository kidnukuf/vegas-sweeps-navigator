/** November is banquet-only. Apply to issuance and validation, not just UI. */
export const BANQUET_ONLY_EVENT_IDS = new Set<number>([3960003]);

export function isPoolPassSuppressed(eventId: number | string | null | undefined): boolean {
  return eventId != null && BANQUET_ONLY_EVENT_IDS.has(Number(eventId));
}
