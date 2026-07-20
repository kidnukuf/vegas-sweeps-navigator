import { describe, expect, it } from "vitest";
import {
  guestIdFor,
  guestSuffix,
  guestCountFromAmount,
  buildWeightedPlaylist,
  isSurveyAvailable,
  TIER_WEIGHT,
} from "../shared/bobLogic";

describe("guestSuffix / guestIdFor", () => {
  it("maps the first guests to A, B, C", () => {
    expect(guestSuffix(0)).toBe("A");
    expect(guestSuffix(1)).toBe("B");
    expect(guestSuffix(2)).toBe("C");
  });

  it("rolls over past Z into AA, AB", () => {
    expect(guestSuffix(25)).toBe("Z");
    expect(guestSuffix(26)).toBe("AA");
    expect(guestSuffix(27)).toBe("AB");
  });

  it("appends the suffix to the bowler's 10-digit id", () => {
    expect(guestIdFor("1234567890", 0)).toBe("1234567890A");
    expect(guestIdFor("1234567890", 1)).toBe("1234567890B");
  });

  it("throws on negative index", () => {
    expect(() => guestSuffix(-1)).toThrow();
  });
});

describe("guestCountFromAmount", () => {
  it("derives pool guest count at $15 each", () => {
    expect(guestCountFromAmount(15, 15)).toBe(1);
    expect(guestCountFromAmount(45, 15)).toBe(3);
    expect(guestCountFromAmount(50, 15)).toBe(3); // floors partial
  });

  it("derives banquet guest count at $80 each", () => {
    expect(guestCountFromAmount(80, 80)).toBe(1);
    expect(guestCountFromAmount(160, 80)).toBe(2);
  });

  it("returns 0 for zero / negative / invalid input", () => {
    expect(guestCountFromAmount(0, 15)).toBe(0);
    expect(guestCountFromAmount(-15, 15)).toBe(0);
    expect(guestCountFromAmount(NaN, 15)).toBe(0);
    expect(guestCountFromAmount(15, 0)).toBe(0);
  });
});

describe("buildWeightedPlaylist", () => {
  it("expands each tier by its weight", () => {
    const ads = [
      { id: 1, tier: "gold" as const },
      { id: 2, tier: "silver" as const },
      { id: 3, tier: "bronze" as const },
    ];
    const playlist = buildWeightedPlaylist(ads);
    expect(playlist).toHaveLength(TIER_WEIGHT.gold + TIER_WEIGHT.silver + TIER_WEIGHT.bronze);
    expect(playlist.filter((a) => a.id === 1)).toHaveLength(4);
    expect(playlist.filter((a) => a.id === 2)).toHaveLength(2);
    expect(playlist.filter((a) => a.id === 3)).toHaveLength(1);
  });

  it("gold gets twice the share of silver, silver twice bronze", () => {
    expect(TIER_WEIGHT.gold).toBe(TIER_WEIGHT.silver * 2);
    expect(TIER_WEIGHT.silver).toBe(TIER_WEIGHT.bronze * 2);
  });

  it("returns empty for no ads", () => {
    expect(buildWeightedPlaylist([])).toEqual([]);
  });
});

describe("isSurveyAvailable", () => {
  it("is available only when enabled, open, and not yet submitted", () => {
    expect(isSurveyAvailable({ surveyEnabled: true, surveyOpen: true, alreadySubmitted: false })).toBe(true);
  });

  it("is hidden when not enabled", () => {
    expect(isSurveyAvailable({ surveyEnabled: false, surveyOpen: true, alreadySubmitted: false })).toBe(false);
  });

  it("is hidden when the director has not opened it", () => {
    expect(isSurveyAvailable({ surveyEnabled: true, surveyOpen: false, alreadySubmitted: false })).toBe(false);
  });

  it("is hidden once the bowler has submitted", () => {
    expect(isSurveyAvailable({ surveyEnabled: true, surveyOpen: true, alreadySubmitted: true })).toBe(false);
  });
});
