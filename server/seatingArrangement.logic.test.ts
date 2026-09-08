import { describe, expect, it } from "vitest";
import { buildSeatingArrangementSheetPlan, snapshotSeatingSheet } from "./seatingArrangement.logic";

describe("Seating Arrangement sheet plan", () => {
  it("adds Seating Arrangement only to blank BP and writes table numbers without disturbing BO", () => {
    const headers = Array.from({ length: 68 }, () => "");
    headers[0] = "Bowler ID";
    headers[66] = "Hotel Room ID"; // BO must remain intact.
    const rows = [headers, ["0101260101", ...Array(65), "182"], ["0101260102", ...Array(65), "182"]];

    const plan = buildSeatingArrangementSheetPlan(rows, [
      { scantronId: "0101260101", tableNumber: 4 },
      { scantronId: "0101260102", tableNumber: 12 },
    ]);

    expect(plan.columnIssue).toBeNull();
    expect(plan.headerNeedsAdd).toBe(true);
    expect(plan.updates).toEqual([
      { rowNumber: 2, tableNumber: 4 },
      { rowNumber: 3, tableNumber: 12 },
    ]);
    expect(headers[66]).toBe("Hotel Room ID");
    expect(snapshotSeatingSheet("November 6 event", rows)).toHaveLength(64);
  });

  it("refuses unsafe writes when BP has another header or an assignment cannot be uniquely matched", () => {
    const headers = Array.from({ length: 68 }, () => "");
    headers[0] = "Bowler ID";
    headers[67] = "Other field";
    const plan = buildSeatingArrangementSheetPlan([headers, ["0101260101"], ["0101260101"]], [
      { scantronId: "0101260101", tableNumber: 4 },
      { scantronId: "9999999999", tableNumber: 5 },
    ]);

    expect(plan.columnIssue).toContain("BP is already labeled");
    expect(plan.duplicateBowlerIds).toEqual(["0101260101"]);
    expect(plan.missingBowlerIds).toEqual(["0101260101", "9999999999"]);
  });
});
