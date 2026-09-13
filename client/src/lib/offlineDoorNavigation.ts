export function resolveOfflineDoorEventId(
  search: string,
  savedEventId: string | null,
  fallbackEventId = 1
): number {
  const requestedEventId = Number(new URLSearchParams(search).get("eventId"));
  if (Number.isFinite(requestedEventId) && requestedEventId > 0) return requestedEventId;

  const persistedEventId = Number(savedEventId);
  if (Number.isFinite(persistedEventId) && persistedEventId > 0) return persistedEventId;

  return fallbackEventId;
}

/** A cached offline dataset is safe to scan only when it belongs to the route event. */
export function isOfflineDoorDatasetForEvent(
  meta: { eventId?: number | null } | null | undefined,
  eventId: number
): boolean {
  return Boolean(meta && Number(meta.eventId) === eventId);
}
