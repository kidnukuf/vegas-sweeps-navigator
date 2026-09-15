import { describe, expect, it } from "vitest";
import { extractImportMappedFields } from "./importMapping";

describe("import header field extraction", () => {
  it("reads Additional Guest, Hotel Room ID, and Seating Arrangement by header", () => {
    expect(extractImportMappedFields({
      "Additional Guest": "Taylor Guest",
      "Hotel Room ID": "5",
      "Seating Arrangement": "Table 12",
    })).toEqual({
      additionalGuest: "Taylor Guest",
      hotelRoomId: "5",
      seatingArrangement: "Table 12",
    });
  });

  it("accepts the existing alternate spellings without changing blank values", () => {
    expect(extractImportMappedFields({
      additionalGuestName: "Jordan Guest",
      room_id: "7G",
      "Assigned Table #": "Table 4",
    })).toEqual({
      additionalGuest: "Jordan Guest",
      hotelRoomId: "7G",
      seatingArrangement: "Table 4",
    });
    expect(extractImportMappedFields({})).toEqual({
      additionalGuest: "",
      hotelRoomId: null,
      seatingArrangement: null,
    });
  });
});
