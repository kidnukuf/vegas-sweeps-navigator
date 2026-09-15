export type OfflineDoorView = "console" | "A" | "B";

export function resolveOfflineDoorView(search: string): OfflineDoorView {
  const params = new URLSearchParams(search);
  const requested = String(params.get("station") ?? params.get("view") ?? "").trim().toUpperCase();
  return requested === "A" || requested === "B" ? requested : "console";
}

export function buildOfflineDoorStationUrl(origin: string, eventId: number, station: "A" | "B"): string {
  const url = new URL("/offline-door", origin);
  url.searchParams.set("eventId", String(eventId));
  url.searchParams.set("station", station);
  return url.toString();
}

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
