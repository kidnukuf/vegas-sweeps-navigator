import { describe, expect, it } from "vitest";

const configuredSiteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? "0x4AAAAAAFULtwEfBB2OE5zWHUyan_6FJmU";
const configuredHostnames = (process.env.TURNSTILE_HOSTNAMES ?? "www.bowlvegas.com,bowlvegas.com,bowlvegas.manus.space,vegasweeps-y8eywesk.manus.space")
  .split(",")
  .map((hostname) => hostname.trim())
  .filter(Boolean);
const configuredSecret = process.env.TURNSTILE_SECRET_KEY ?? "";

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

  it("accepts the configured secret at Cloudflare Siteverify", async () => {
    expect(configuredSecret).toMatch(/^0x[0-9A-Za-z_-]{20,}$/);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: configuredSecret, response: "test-invalid-token" }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.ok).toBe(true);
    const result = await response.json() as { success?: boolean; "error-codes"?: string[] };
    expect(result["error-codes"] ?? []).not.toContain("invalid-input-secret");
    expect(result.success).toBe(false);
  }, 20_000);
});
