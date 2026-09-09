import { describe, expect, it } from "vitest";
import { getEventScheduleState } from "./eventSchedule";

describe("getEventScheduleState", () => {
  it("keeps an individual hotel date ahead of the event default and reports it once", () => {
    const state = getEventScheduleState({
      checkinDate: "November 5, 2026",
      eventSettings: { hotelCheckinDay: "November 6", hotelCheckinTime: "3:00 PM" },
    });

    expect(state.checkinLabel).toBe("November 5, 2026");
    expect(state.hasHotel).toBe(true);
  });

  it("shows a configured banquet even when a table, location, and time are not yet assigned", () => {
    const state = getEventScheduleState({ eventSettings: { banquetDay: "Saturday" } });

    expect(state.hasBanquet).toBe(true);
    expect(state.hasInfo).toBe(true);
  });
});
