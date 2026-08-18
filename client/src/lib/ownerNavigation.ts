export function createEventDirectorWorkspacePath(eventId: number): string {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new Error("A valid event ID is required to open the Event Director Portal.");
  }
  return `/ed?eventId=${eventId}`;
}
