import { describe, expect, it } from "vitest";
import { canAccessAssignedEvent, type EdSession } from "./_core/edAuth";

describe("company-scoped Event Director access", () => {
  it("allows the platform owner and Cassie's platform-administrator role across all events", () => {
    const owner: EdSession = { type: "owner", userId: 1 };
    const cassie: EdSession = { type: "platform_admin", staffId: 30001, staffName: "Cassie Davis" };
    expect(canAccessAssignedEvent(owner, false)).toBe(true);
    expect(canAccessAssignedEvent(cassie, false)).toBe(true);
  });

  it("requires a same-company event assignment for a standard Event Director", () => {
    const director: EdSession = { type: "staff", staffId: 20, staffName: "Director A", companyId: 7 };
    expect(canAccessAssignedEvent(director, true)).toBe(true);
    expect(canAccessAssignedEvent(director, false)).toBe(false);
  });

  it("rejects an Event Director with no company assignment", () => {
    const unassigned: EdSession = { type: "staff", staffId: 20, staffName: "Unassigned", companyId: null };
    expect(canAccessAssignedEvent(unassigned, true)).toBe(false);
  });
});
