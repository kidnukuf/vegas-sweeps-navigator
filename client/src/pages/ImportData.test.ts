import { describe, expect, it } from "vitest";
import { mapHeaders, parseRows } from "./ImportData";

describe("ImportData second-squad lane mapping", () => {
  it("maps #2 Lane separately from the primary Lane # and preserves the raw header for server import", () => {
    const headers = ["First Name", "Last Name", "Center", "Lane #", "2nd Squad Time", "#2 Lane"];
    const headerMap = mapHeaders(headers);
    const [row] = parseRows([["Alex", "Bowler", "Example Lanes", "8", "Sunday 9:00 AM", "42"]], headerMap, headers);

    expect(headerMap).toMatchObject({ 3: "laneNumber", 4: "squadTime2", 5: "laneNumber2" });
    expect(row?.raw).toMatchObject({ "Lane #": "8", "2nd Squad Time": "Sunday 9:00 AM", "#2 Lane": "42" });
  });
});
