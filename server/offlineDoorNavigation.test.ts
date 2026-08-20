import { describe, expect, it } from "vitest";
import { resolveOfflineDoorEventId } from "../client/src/lib/offlineDoorNavigation";

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
