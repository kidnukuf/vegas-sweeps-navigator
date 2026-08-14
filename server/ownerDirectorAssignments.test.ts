import { describe, expect, it } from "vitest";
import { groupEventDirectors } from "./ownerDirectorAssignments";

describe("groupEventDirectors", () => {
  it("groups distinct Event Directors by their assigned event", () => {
    expect(groupEventDirectors([
      { eventId: 1980003, staffId: 30001, name: "Cassie Davis", username: "CassieDavis" },
      { eventId: 1980003, staffId: 30002, name: "Nate Jones", username: "NateJones" },
      { eventId: 1980003, staffId: 30001, name: "Cassie Davis", username: "CassieDavis" },
      { eventId: 1980004, staffId: 30001, name: "Cassie Davis", username: "CassieDavis" },
    ])).toEqual({
      1980003: [
        { staffId: 30001, name: "Cassie Davis", username: "CassieDavis" },
        { staffId: 30002, name: "Nate Jones", username: "NateJones" },
      ],
      1980004: [{ staffId: 30001, name: "Cassie Davis", username: "CassieDavis" }],
    });
  });

  it("falls back to the username when a staff display name is unavailable", () => {
    expect(groupEventDirectors([
      { eventId: "1980003", staffId: "30001", name: null, username: "CassieDavis" },
    ])).toEqual({
      1980003: [{ staffId: 30001, name: "CassieDavis", username: "CassieDavis" }],
    });
  });
});
