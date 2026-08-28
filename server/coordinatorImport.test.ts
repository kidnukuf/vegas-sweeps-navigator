import { describe, expect, it } from "vitest";
import {
  buildCoordinatorImport,
  generateCoordinatorBowlerId,
  MASTER_PASTE_HEADERS,
  MASTER_PASTE_PROTECTED_HEADERS,
} from "../shared/coordinatorImport";

const centers = [{ centerName: "Example Bowl", centerCode: 7 }];
const headers = ["Cell", "E-mail", "Squad", "Lane Number", "House", "League Secretary", "Team No", "Is Captain", "First", "Last", "U21", "USBC #", "Games", "Average", "Team", "Shirt Size", "Arrival", "Departure", "Position"];
const baseRow = ["555-0101", "jordan@example.com", "M10", "42", "Example Bowl", "Kim", "5", "yes", "Jordan", "Lee", "N", "123-456", "9", "197", "Pin Pals", "L", "06/25/2026", "07/02/2026", "2"];

describe("Coordinator Import", () => {
  it("keeps the exact 66-column MASTER_PASTE schema", () => {
    expect(MASTER_PASTE_HEADERS).toHaveLength(66);
    expect(MASTER_PASTE_HEADERS[0]).toBe("Bowler ID");
    expect(MASTER_PASTE_HEADERS.at(-1)).toBe("Team Score");
  });

  it("maps coordinator aliases and uses the established CC + LL + EE + TT + BB ID format", () => {
    const result = buildCoordinatorImport([headers, baseRow], centers, "3", "1");
    expect(result.errorRows).toHaveLength(0);
    expect(result.masterRows).toHaveLength(1);
    expect(result.masterRows[0]).toMatchObject({
      "Bowler ID": "0703010502",
      Phone: "555-0101",
      Email: "jordan@example.com",
      "Squad Day & Time": "M10",
      "Lane #": "42",
      Center: "Example Bowl",
      Coordinator: "Kim",
      "Team #": "5",
      Captain: "Y",
      "First Name": "Jordan",
      "Last Name": "Lee",
      "Best Avg": "197",
      "Team Name": "Pin Pals",
      "T-Shirt Size": "L",
    });
    expect(generateCoordinatorBowlerId("07", "3", "01", "05", "02")).toBe("0703010502");
  });

  it("merges two source rows for the same person into primary and second squad fields", () => {
    const secondRow = [...baseRow];
    secondRow[2] = "M3";
    secondRow[3] = "17";
    const result = buildCoordinatorImport([headers, baseRow, secondRow], centers, "03", "01");
    expect(result.masterRows).toHaveLength(1);
    expect(result.summary.mergedSecondSquad).toBe(1);
    expect(result.previewRows[0]).toMatchObject({ status: "Merge-2nd-squad", sourceRows: [3, 2], squadTime: "M3" });
    expect(result.masterRows[0]).toMatchObject({ "Squad Day & Time": "M3", "Lane #": "17", "2nd Squad Time": "M10", "2nd Lane #": "42" });
  });

  it("excludes a third squad from MASTER_PASTE and records each duplicate source row as an error", () => {
    const second = [...baseRow]; second[2] = "M3";
    const third = [...baseRow]; third[2] = "M12";
    const result = buildCoordinatorImport([headers, baseRow, second, third], centers, "03", "01");
    expect(result.masterRows).toHaveLength(0);
    expect(result.summary.error).toBe(3);
    expect(result.errorRows.every((row) => row.reason === ">2 squads for the same bowler")).toBe(true);
  });

  it("leaves all QR, usage, guest, claim, billing, score, and survey columns empty", () => {
    const result = buildCoordinatorImport([headers, baseRow], centers, "03", "01");
    const master = result.masterRows[0];
    expect(Array.from(MASTER_PASTE_PROTECTED_HEADERS).every((header) => master[header] === "")).toBe(true);
  });
});
