import { describe, expect, it } from "vitest";
import { formatPacificDate, formatPacificDateTime, formatPacificTime } from "./timezone";

describe("Pacific timezone formatting", () => {
  const summer = "2026-07-04T20:30:00.000Z";
  const winter = "2026-01-04T20:30:00.000Z";

  it("formats date and time in Pacific daylight time", () => {
    expect(formatPacificDateTime(summer)).toBe("7/4/2026, 1:30 PM");
    expect(formatPacificTime(summer)).toBe("1:30 PM");
    expect(formatPacificDate(summer)).toBe("July 4, 2026");
  });

  it("formats winter timestamps with the Pacific standard-time offset", () => {
    expect(formatPacificDateTime(winter)).toBe("1/4/2026, 12:30 PM");
    expect(formatPacificTime(winter)).toBe("12:30 PM");
  });

  it("returns a safe placeholder for invalid or missing values", () => {
    expect(formatPacificDateTime(null)).toBe("—");
    expect(formatPacificTime("not-a-date")).toBe("—");
  });
});
