import { describe, expect, it } from "vitest";
import { canAccessAssignedEvent, isManusOwnerUser, isOwnerSession, type EdSession } from "./_core/edAuth";

describe("scoped Event Director access", () => {
  it("allows only the platform owner across all events", () => {
    const owner: EdSession = { type: "owner", userId: 1 };
    const cassie: EdSession = { type: "staff", staffId: 30001, staffName: "Cassie Davis" };
    expect(canAccessAssignedEvent(owner, false)).toBe(true);
    expect(canAccessAssignedEvent(cassie, false)).toBe(false);
    expect(canAccessAssignedEvent(cassie, true)).toBe(true);
  });

  it("requires an event relationship for a standard Event Director", () => {
    const director: EdSession = { type: "staff", staffId: 20, staffName: "Director A", companyId: 7 };
    expect(canAccessAssignedEvent(director, true)).toBe(true);
    expect(canAccessAssignedEvent(director, false)).toBe(false);
  });

  it("allows an unassigned Event Director to access only their own event", () => {
    const unassigned: EdSession = { type: "staff", staffId: 20, staffName: "Unassigned", companyId: null };
    expect(canAccessAssignedEvent(unassigned, true)).toBe(true);
    expect(canAccessAssignedEvent(unassigned, false)).toBe(false);
  });

  it("reserves the private owner dashboard boundary for the configured Manus owner", () => {
    expect(isOwnerSession({ type: "owner", userId: 1 })).toBe(true);
    expect(isOwnerSession({ type: "staff", staffId: 30001, staffName: "Cassie Davis" })).toBe(false);
    expect(isOwnerSession({ type: "staff", staffId: 20, staffName: "Director A", companyId: 7 })).toBe(false);
  });

  it("recognizes the application-level Manus admin as an owner when the configured open ID is unavailable", () => {
    expect(isManusOwnerUser({ id: 1, openId: "current-manus-session", role: "admin" })).toBe(true);
    expect(isManusOwnerUser({ id: 2, openId: "standard-manus-session", role: "user" })).toBe(false);
  });
});
