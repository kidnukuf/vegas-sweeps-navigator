export type EventDirectorAssignmentRow = {
  eventId: number | string;
  staffId: number | string;
  name: string | null;
  username: string | null;
};

export type AssignedEventDirector = {
  staffId: number;
  name: string;
  username: string;
};

/** Groups director assignments by event without duplicating event overview metrics. */
export function groupEventDirectors(rows: EventDirectorAssignmentRow[]): Record<number, AssignedEventDirector[]> {
  return rows.reduce<Record<number, AssignedEventDirector[]>>((grouped, row) => {
    const eventId = Number(row.eventId);
    const staffId = Number(row.staffId);
    if (!Number.isInteger(eventId) || !Number.isInteger(staffId)) return grouped;
    const directors = grouped[eventId] ?? [];
    if (!directors.some((director) => director.staffId === staffId)) {
      directors.push({
        staffId,
        name: row.name?.trim() || row.username?.trim() || "Unnamed Event Director",
        username: row.username?.trim() || "",
      });
    }
    grouped[eventId] = directors;
    return grouped;
  }, {});
}
