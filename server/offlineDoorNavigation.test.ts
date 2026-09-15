import { describe, expect, it } from "vitest";
import { buildOfflineDoorStationUrl, isOfflineDoorDatasetForEvent, resolveOfflineDoorEventId, resolveOfflineDoorView } from "../client/src/lib/offlineDoorNavigation";

describe("resolveOfflineDoorEventId", () => {
  it("prefers the explicit selected event in the scanner link", () => {
    expect(resolveOfflineDoorEventId("?eventId=1980003", "1")).toBe(1980003);
  });

  it("uses the persisted event only when the link has no valid event context", () => {
    expect(resolveOfflineDoorEventId("?eventId=invalid", "1980003")).toBe(1980003);
  });

  it("uses a safe fallback when neither source contains a valid event ID", () => {
    expect(resolveOfflineDoorEventId("", null)).toBe(1);
  });
});

describe("resolveOfflineDoorView", () => {
  it("selects Scanner A or B from an explicit station URL", () => {
    expect(resolveOfflineDoorView("?eventId=3390003&station=A")).toBe("A");
    expect(resolveOfflineDoorView("?eventId=3390003&station=B")).toBe("B");
  });

  it("defaults unknown or absent station values to the console", () => {
    expect(resolveOfflineDoorView("")).toBe("console");
    expect(resolveOfflineDoorView("?station=unknown")).toBe("console");
  });
});

describe("buildOfflineDoorStationUrl", () => {
  it("preserves the event identity in shareable station links", () => {
    expect(buildOfflineDoorStationUrl("http://localhost:3000", 3390003, "B")).toBe("http://localhost:3000/offline-door?eventId=3390003&station=B");
  });
});

describe("isOfflineDoorDatasetForEvent", () => {
  it("accepts cached data for the selected event", () => {
    expect(isOfflineDoorDatasetForEvent({ eventId: 3390003 }, 3390003)).toBe(true);
  });

  it("rejects cached data from a different event", () => {
    expect(isOfflineDoorDatasetForEvent({ eventId: 1980003 }, 3390003)).toBe(false);
    expect(isOfflineDoorDatasetForEvent(null, 3390003)).toBe(false);
  });
});
