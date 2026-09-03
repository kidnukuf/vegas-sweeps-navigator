import { describe, expect, it } from "vitest";
import { buildHotelRoomPlan } from "../shared/hotelRoomPlanner";

describe("Hotel Room ID planning", () => {
  it("assigns shared numeric IDs, guest suffixes, and solo numeric IDs without joining ambiguous names", () => {
    const plan = buildHotelRoomPlan([
      { rowNumber: 2, firstName: "Bowler", lastName: "One", roommateFirstName: "Bowler", roommateLastName: "Three" },
      { rowNumber: 3, firstName: "Bowler", lastName: "Two" },
      { rowNumber: 4, firstName: "Bowler", lastName: "Three", roommateFirstName: "Bowler", roommateLastName: "One" },
      { rowNumber: 5, firstName: "Bowler", lastName: "Four", roommateFirstName: "Guest", roommateLastName: "Person" },
      { rowNumber: 6, firstName: "Pat", lastName: "Lee", roommateFirstName: "Taylor", roommateLastName: "Smith" },
      { rowNumber: 7, firstName: "Taylor", lastName: "Smith" },
      { rowNumber: 8, firstName: "Taylor", lastName: "Smith" },
    ]);

    expect(plan.assignments.map((assignment) => assignment.roomId)).toEqual(["1", "2", "1", "3G", "4", "5", "6"]);
    expect(plan.assignments[0]?.status).toBe("shared_bowler");
    expect(plan.assignments[1]?.status).toBe("solo");
    expect(plan.assignments[3]?.status).toBe("guest_roommate");
    expect(plan.assignments[4]?.status).toBe("ambiguous_solo");
    expect(plan.summary).toMatchObject({ rosterRows: 7, uniqueRooms: 6, guestRooms: 1, ambiguousSoloRows: 1 });
  });

  it("treats incomplete or placeholder roommate values as individual numeric rooms", () => {
    const plan = buildHotelRoomPlan([
      { rowNumber: 2, firstName: "A", lastName: "One", roommateFirstName: "Self", roommateLastName: "Self" },
      { rowNumber: 3, firstName: "B", lastName: "Two", roommateFirstName: "Chris" },
      { rowNumber: 4, firstName: "C", lastName: "Three", roommateFirstName: "N/A", roommateLastName: "" },
    ]);
    expect(plan.assignments.map((assignment) => assignment.roomId)).toEqual(["1", "2", "3"]);
    expect(plan.summary.ambiguousSoloRows).toBe(2);
  });
});
