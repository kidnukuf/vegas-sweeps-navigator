import type { EventDirectorAttentionTab } from "./ownerReadinessNavigation";

export function createEventDirectorWorkspacePath(eventId: number, focus?: EventDirectorAttentionTab): string {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new Error("A valid event ID is required to open the Event Director Portal.");
  }
  return `/ed?eventId=${eventId}${focus ? `&focus=${focus}` : ""}`;
}
