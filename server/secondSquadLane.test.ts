import { describe, expect, it } from "vitest";
import { SECOND_SQUAD_LANE_HEADER, parseSecondSquadLane, readSecondSquadLaneValue } from "../shared/secondSquadLane";

describe("second-squad lane header mapping", () => {
  it("uses Column Y's #2 Lane header as the second-squad lane", () => {
    expect(SECOND_SQUAD_LANE_HEADER).toBe("#2 Lane");
    expect(readSecondSquadLaneValue({ "#2 Lane": " 42 " })).toBe("42");
    expect(parseSecondSquadLane({ "#2 Lane": "42" })).toBe(42);
  });

  it("retains legacy headers and does not treat the first-squad Lane # as a second-squad lane", () => {
    expect(parseSecondSquadLane({ "#2 Lane": "" })).toBeNull();
    expect(parseSecondSquadLane({ "2nd Lane #": "17" })).toBe(17);
    expect(parseSecondSquadLane({ "Lane #": "8" })).toBeNull();
  });
});
