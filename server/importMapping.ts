export type ImportMappedFields = {
  additionalGuest: string;
  hotelRoomId: string | null;
  seatingArrangement: string | null;
};

function readFirst(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/**
 * Reads source columns by their human-facing headers. Keeping these aliases in
 * one pure helper prevents the preview mapping and the database import from
 * drifting apart when coordinators use an existing sheet template.
 */
export function extractImportMappedFields(row: Record<string, unknown>): ImportMappedFields {
  return {
    additionalGuest: readFirst(row, [
      "Additional Guest",
      "Additional Guest Name",
      "additionalGuestName",
      "additional_guest_name",
    ]),
    hotelRoomId: readFirst(row, [
      "Hotel Room ID",
      "Hotel Room #",
      "Room ID",
      "hotelRoomId",
      "room_id",
      "roomId",
    ]) || null,
    seatingArrangement: readFirst(row, [
      "Seating Arrangement",
      "Seating Arrangement ID",
      "Assigned Table #",
      "Assigned Table",
      "Table #",
      "Table",
      "banquet_table",
      "Banquet Table",
    ]) || null,
  };
}
