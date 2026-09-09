import { describe, expect, it } from "vitest";

describe("Cloudflare transactional email token", () => {
  it("is active and can authenticate to Cloudflare's token verification endpoint", async () => {
    const token = process.env.CLOUDFLARE_EMAIL_SENDING_TOKEN;
    expect(token, "CLOUDFLARE_EMAIL_SENDING_TOKEN must be configured").toBeTruthy();

    const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json() as { success?: boolean; result?: { status?: string } };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.result?.status).toBe("active");
  });
});
