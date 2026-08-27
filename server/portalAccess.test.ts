import { describe, expect, it } from "vitest";
import {
  ED_STAFF_SESSION_MARKER,
  getPortalSignInPath,
  hasVerifiedEventDirectorAccess,
  isLegacyEventDirectorSessionCandidate,
} from "../client/src/lib/portalAccess";

describe("protected portal access helpers", () => {
  it("does not treat a client-side staff marker as a validated legacy Event Director session", () => {
    expect(isLegacyEventDirectorSessionCandidate(ED_STAFF_SESSION_MARKER)).toBe(false);
    expect(isLegacyEventDirectorSessionCandidate("")).toBe(false);
    expect(isLegacyEventDirectorSessionCandidate(null)).toBe(false);
  });

  it("allows Event Director rendering only after an owner, staff, or validated legacy session is present", () => {
    expect(hasVerifiedEventDirectorAccess({ isOwnerSession: false, staffAccess: null, legacyAccess: null })).toBe(false);
    expect(hasVerifiedEventDirectorAccess({ isOwnerSession: true, staffAccess: null, legacyAccess: null })).toBe(true);
    expect(hasVerifiedEventDirectorAccess({ isOwnerSession: false, staffAccess: { type: "staff" }, legacyAccess: null })).toBe(true);
    expect(hasVerifiedEventDirectorAccess({ isOwnerSession: false, staffAccess: null, legacyAccess: { type: "legacy" } })).toBe(true);
  });

  it("routes unauthenticated bowlers and captains to their appropriate sign-in pages", () => {
    expect(getPortalSignInPath("bowler")).toBe("/bowler-login");
    expect(getPortalSignInPath("captain")).toBe("/captain-login");
  });
});
