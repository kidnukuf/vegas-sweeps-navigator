import { describe, expect, it } from "vitest";

const configuredSiteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? "0x4AAAAAAFULtwEfBB2OE5zWHUyan_6FJmU";
const configuredHostnames = (process.env.TURNSTILE_HOSTNAMES ?? "www.bowlvegas.com,bowlvegas.com,bowlvegas.manus.space,vegasweeps-y8eywesk.manus.space")
  .split(",")
  .map((hostname) => hostname.trim())
  .filter(Boolean);

describe("Cloudflare Turnstile frontend configuration", () => {
  it("uses a valid public site-key shape and can reach the Turnstile widget API", async () => {
    expect(configuredSiteKey).toMatch(/^0x[0-9A-Za-z_-]{20,}$/);

    const response = await fetch(
      `https://challenges.cloudflare.com/turnstile/v0/api.js?render=${encodeURIComponent(configuredSiteKey)}`,
      { signal: AbortSignal.timeout(10_000) },
    );

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type") ?? "").toContain("javascript");
  }, 20_000);

  it("contains only approved production hostnames", () => {
    expect(configuredHostnames).toEqual([
      "www.bowlvegas.com",
      "bowlvegas.com",
      "bowlvegas.manus.space",
      "vegasweeps-y8eywesk.manus.space",
    ]);
    expect(configuredHostnames).not.toContain("localhost");
    expect(configuredHostnames).not.toContain("127.0.0.1");
  });
});
