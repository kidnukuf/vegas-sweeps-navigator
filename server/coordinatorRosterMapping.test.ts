import { describe, expect, it } from "vitest";
import { mapCoordinatorSourceMatrix, sourceMatrixToCsv } from "../shared/coordinatorRosterMapping";

describe("coordinator roster source mapping", () => {
  it("maps common coordinator headers and excludes app-controlled data", () => {
    const mapped = mapCoordinatorSourceMatrix([
      ["First Name", "Last Name", "Phone Number", "Team #", "Team Name", "Captain", "Claim Code", "Banquet QR", "Unrelated"],
      ["Alex", "Rivera", "702-555-0100", "12", "Pins Up", "Yes", "DO-NOT-KEEP", "https://example.test/qr", "ignore me"],
    ]);
    expect(mapped.rows).toEqual([{ firstName: "Alex", lastName: "Rivera", phone: "702-555-0100", teamNumber: "12", teamName: "Pins Up", captain: "Yes" }]);
    expect(mapped.recognizedHeaders).toContain("Team #");
    expect(mapped.appControlledHeaders).toEqual(["Claim Code", "Banquet QR"]);
    expect(mapped.ignoredHeaders).toEqual(["Unrelated"]);
  });

  it("creates a quoted snapshot CSV without adding sample roster values", () => {
    expect(sourceMatrixToCsv([["First Name", "Team Name"], ["Avery", "Pins, Up"]])).toBe('"First Name","Team Name"\r\n"Avery","Pins, Up"');
  });
});
