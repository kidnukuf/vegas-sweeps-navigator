import { describe, expect, it } from "vitest";
import { parseRow, runSeatingAlgorithm } from "../client/src/lib/seatingAlgorithm";

describe("guest-aware banquet seating", () => {
  it("counts a named guest as a seat and keeps the guest on the host's table", () => {
    const host = parseRow("1801260201", "Jordan Bowler", 0)!;
    const guest = parseRow("1801260201A", "Jordan's Guest", 1)!;
    const teammate = parseRow("1801260202", "Casey Teammate", 2)!;

    const result = runSeatingAlgorithm([host, guest, teammate], 4, 80);
    const hostSeat = result.byOriginalIndex.get(0)!;
    const guestSeat = result.byOriginalIndex.get(1)!;

    expect(result.assignments).toHaveLength(3);
    expect(guestSeat.tableNum).toBe(hostSeat.tableNum);
    expect(guestSeat.seatLetter).toBe("B");
    expect(result.tableMap.get(hostSeat.tableNum)).toHaveLength(3);
  });
});
