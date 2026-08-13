import { describe, expect, it } from "vitest";
import { resolveAccessibleEventId } from "../client/src/lib/eventAccess";

describe("Event Director accessible-event recovery", () => {
  it("keeps an assigned event selected", () => {
    expect(resolveAccessibleEventId(12, [{ id: 12 }, { id: 19 }])).toBe(12);
  });

  it("replaces a stale or unauthorized saved event with the first assigned event", () => {
    expect(resolveAccessibleEventId(999, [{ id: 12 }, { id: 19 }])).toBe(12);
  });

  it("returns no active event when the director has no assigned portfolio", () => {
    expect(resolveAccessibleEventId(999, [])).toBeNull();
  });
});
