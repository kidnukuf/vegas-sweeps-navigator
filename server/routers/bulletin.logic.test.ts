import { describe, expect, it } from "vitest";
import { canModerateBulletin, canPostToBulletin, canReadBulletin, canSeeLocalOffer, isSafeBoardBody } from "./bulletin.logic";
import { bulletinRouter } from "./bulletin";

describe("center bulletin board authorization", () => {
  const bowler = { actorType: "bowler" as const, eventId: 1980003, centerId: 17 };
  const director = { actorType: "event_director" as const, eventIds: [1980003] };

  it("registers the bulletin-board router", () => {
    expect(bulletinRouter).toBeDefined();
  });

  it("isolates participant posting and reading to the correct event and center", () => {
    expect(canPostToBulletin(bowler, 1980003, 17)).toBe(true);
    expect(canPostToBulletin(bowler, 1980003, 18)).toBe(false);
    expect(canReadBulletin(bowler, 1980003, 17)).toBe(true);
    expect(canReadBulletin(bowler, 1980004, 17)).toBe(false);
    expect(canReadBulletin({ actorType: "captain", eventId: 1980003, centerId: 18 }, 1980003, 17)).toBe(false);
  });

  it("permits moderation only to the Owner or the Event Director who owns that event", () => {
    expect(canModerateBulletin(director, 1980003)).toBe(true);
    expect(canModerateBulletin(director, 1980004)).toBe(false);
    expect(canModerateBulletin({ actorType: "owner" }, 1980003)).toBe(true);
    expect(canModerateBulletin(bowler, 1980003)).toBe(false);
  });

  it("shows only matching-center offers to participants and accepts bounded board content", () => {
    expect(canSeeLocalOffer(bowler, 1980003, null)).toBe(true);
    expect(canSeeLocalOffer(bowler, 1980003, 17)).toBe(true);
    expect(canSeeLocalOffer(bowler, 1980003, 18)).toBe(false);
    expect(canSeeLocalOffer(director, 1980003, 18)).toBe(true);
    expect(isSafeBoardBody("Does anyone want to coordinate transportation after bowling?")).toBe(true);
    expect(isSafeBoardBody(" ")).toBe(false);
    expect(isSafeBoardBody("x".repeat(1_001))).toBe(false);
  });
});
