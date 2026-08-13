export type AccessibleEvent = { id: number | string };

/** Keeps a saved local event choice within the authenticated director's visible portfolio. */
export function resolveAccessibleEventId(currentEventId: number, events: AccessibleEvent[]) {
  const visibleEventIds = events.map((event) => Number(event.id)).filter(Number.isFinite);
  if (!visibleEventIds.length) return null;
  return visibleEventIds.includes(currentEventId) ? currentEventId : visibleEventIds[0];
}
