import { describe, expect, it } from "vitest";
import { getAdditionalSquadDisplay } from "./additionalSquadDisplay";

describe("getAdditionalSquadDisplay", () => {
  it("uses the second-squad time as the label and preserves the lane assignment", () => {
    expect(getAdditionalSquadDisplay("Saturday 9:00am", 3)).toEqual({
      label: "Saturday 9:00am",
      value: "Lane 3",
      icon: "lane",
    });
  });

  it("normalizes coded second-squad times before using them as the label", () => {
    expect(getAdditionalSquadDisplay("M3", 12)).toEqual({
      label: "Monday 3pm",
      value: "Lane 12",
      icon: "lane",
    });
  });

  it("falls back to a time-only display when no second lane is available", () => {
    expect(getAdditionalSquadDisplay("Tuesday 10am", null)).toEqual({
      label: "2nd Squad Time",
      value: "Tuesday 10am",
      icon: "time",
    });
  });
});
