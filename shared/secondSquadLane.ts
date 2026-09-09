export const SECOND_SQUAD_LANE_HEADER = "#2 Lane" as const;

const SECOND_SQUAD_LANE_HEADERS = [
  SECOND_SQUAD_LANE_HEADER,
  "2nd Lane #",
  "Second Lane #",
  "laneNumber2",
  "secondLaneNumber",
] as const;

/**
 * Returns the first supplied second-squad lane value without changing legacy
 * header support. The current master sheet uses #2 Lane in Column Y.
 */
export function readSecondSquadLaneValue(row: Record<string, unknown>): string {
  for (const header of SECOND_SQUAD_LANE_HEADERS) {
    const value = row[header];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

/** Uses the importer's established numeric behavior: blank or zero becomes null. */
export function parseSecondSquadLane(row: Record<string, unknown>): number | null {
  const value = readSecondSquadLaneValue(row);
  return value ? Number.parseInt(value, 10) || null : null;
}
