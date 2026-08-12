import { describe, expect, it } from "vitest";
import { mapHeaders, parseRows } from "../client/src/pages/ImportData";

describe("ImportData second squad parsing", () => {
  it("keeps both duplicate Lane # columns and exposes the second lane to the import server", () => {
    const headers = ["First Name", "Last Name", "Center", "Lane #", "2nd Squad Time", "Lane #"];
    const headerMap = mapHeaders(headers);
    const [row] = parseRows(
      [["Alex", "Bowler", "AMF Mesa", "12", "Tuesday 9:00am", "22"]],
      headerMap,
      headers,
    );

    expect(headerMap[3]).toBe("laneNumber");
    expect(headerMap[5]).toBe("laneNumber2");
    expect(row.raw["Lane #"]).toBe("12");
    expect(row.raw["2nd Squad Time"]).toBe("Tuesday 9:00am");
    expect(row.raw["2nd Lane #"]).toBe("22");
  });
});
