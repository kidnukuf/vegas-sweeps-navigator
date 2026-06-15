import { describe, it, expect } from "vitest";

describe("Cloudflare Turnstile configuration", () => {
  it("TURNSTILE_SECRET_KEY is set and has correct format", () => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    expect(secret).toBeDefined();
    expect(typeof secret).toBe("string");
    // Cloudflare Turnstile secret keys start with "0x4"
    expect(secret).toMatch(/^0x4/);
    expect((secret as string).length).toBeGreaterThan(10);
  });

  it("VITE_TURNSTILE_SITE_KEY is set and has correct format", () => {
    const siteKey = process.env.VITE_TURNSTILE_SITE_KEY;
    expect(siteKey).toBeDefined();
    expect(typeof siteKey).toBe("string");
    // Cloudflare Turnstile site keys start with "0x4"
    expect(siteKey).toMatch(/^0x4/);
    expect((siteKey as string).length).toBeGreaterThan(10);
  });
});
