import { describe, expect, it } from "vitest";
import { getPostLoginPath } from "./_core/oauth";

describe("OAuth post-login routing", () => {
  it("returns a signed-in owner to the requested private route", () => {
    const state = Buffer.from(JSON.stringify({
      redirectUri: "https://www.bobrolloffpassport.com/api/oauth/callback",
      returnPath: "/owner",
    })).toString("base64");
    expect(getPostLoginPath(state)).toBe("/owner");
  });

  it("retains same-site query strings for scoped portal links", () => {
    const state = Buffer.from(JSON.stringify({ returnPath: "/bowler-login?event=1980003" })).toString("base64");
    expect(getPostLoginPath(state)).toBe("/bowler-login?event=1980003");
  });

  it("rejects external and legacy callback-only values", () => {
    const external = Buffer.from(JSON.stringify({ returnPath: "https://example.com" })).toString("base64");
    const legacy = Buffer.from("https://www.bobrolloffpassport.com/api/oauth/callback").toString("base64");
    expect(getPostLoginPath(external)).toBe("/");
    expect(getPostLoginPath(legacy)).toBe("/");
  });
});
