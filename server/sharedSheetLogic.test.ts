import { describe, expect, it } from "vitest";
import { normalizeSpreadsheetId, resolveSharedSheetTarget } from "./sharedSheetLogic";

describe("shared sheet event routing", () => {
  const sharedId = "1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM";

  it("extracts a spreadsheet ID from an editable Google Sheet URL", () => {
    expect(normalizeSpreadsheetId(`https://docs.google.com/spreadsheets/d/${sharedId}/edit?usp=sharing`)).toBe(sharedId);
  });

  it("uses the configured shared sheet and requires an event tab", () => {
    expect(resolveSharedSheetTarget({ sharedSpreadsheetId: sharedId, sheetTabName: "4 Event" })).toEqual({ spreadsheetId: sharedId, sheetTabName: "4 Event" });
    expect(() => resolveSharedSheetTarget({ sharedSpreadsheetId: sharedId, sheetTabName: "" })).toThrow("Choose the Google Sheet tab");
  });

  it("rejects attempts to route a new event to a different sheet", () => {
    expect(() => resolveSharedSheetTarget({ sharedSpreadsheetId: sharedId, requestedSpreadsheetId: "another-sheet", sheetTabName: "4 Event" })).toThrow("shared Google Sheet");
  });
});
