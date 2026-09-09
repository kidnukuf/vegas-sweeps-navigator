import { describe, expect, it } from "vitest";
import { DEFAULT_LEAGUE_NAME_PROMPTS_OPEN, getLeagueNamePromptToggleLabel } from "./LeagueNameManager";

describe("league-name prompt disclosure", () => {
  it("keeps optional league-name prompts collapsed until an Event Director opens them", () => {
    expect(DEFAULT_LEAGUE_NAME_PROMPTS_OPEN).toBe(false);
    expect(getLeagueNamePromptToggleLabel(DEFAULT_LEAGUE_NAME_PROMPTS_OPEN)).toBe("Show league-name prompts");
    expect(getLeagueNamePromptToggleLabel(true)).toBe("Hide league-name prompts");
  });
});
