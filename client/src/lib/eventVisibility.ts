/** Event-specific presentation rules for participant-facing portals. */

// B.O.B. November is a banquet-only event. Keep this explicit so a future
// event-settings change cannot accidentally expose pool-party UI to attendees.
export const POOL_PARTY_HIDDEN_EVENT_IDS = new Set<number>([3960003]);

export function isPoolPartyVisible(eventId?: number | null, eventName?: string | null): boolean {
  if (eventId != null && POOL_PARTY_HIDDEN_EVENT_IDS.has(Number(eventId))) return false;
  if (/\bb\.o\.b\.?\s+november\b/i.test(String(eventName ?? ""))) return false;
  return true;
}
