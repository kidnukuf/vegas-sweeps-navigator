import { describe, expect, it } from "vitest";
import { normalizeLeagueCode, normalizeLeagueName } from "./leagueName.logic";

describe("league name helpers", () => {
  it("normalizes valid one- and two-digit stable League Codes", () => {
    expect(normalizeLeagueCode("1")).toBe("01");
    expect(normalizeLeagueCode("19")).toBe("19");
  });

  it("rejects invalid League Codes and supplies a safe readable fallback", () => {
    expect(normalizeLeagueCode("000")).toBeNull();
    expect(normalizeLeagueCode("0")).toBeNull();
    expect(normalizeLeagueName("  Tuesday   6:30 PM Mixed  ", "03")).toBe("Tuesday 6:30 PM Mixed");
    expect(normalizeLeagueName("", "03")).toBe("League 03");
  });
});
