import { TRPCError } from "@trpc/server";

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY ?? "";

/** Verify a Cloudflare Turnstile assertion while retaining the current test/dev behavior. */
export async function verifyTurnstileToken(token: string, ip?: string): Promise<void> {
  if (!TURNSTILE_SECRET) return;

  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });
  let result: { success: boolean };
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    result = await response.json() as { success: boolean };
  } catch {
    if (process.env.NODE_ENV === "production") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Security check could not be verified. Please try again." });
    }
    return;
  }
  if (!result.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Security check failed. Please refresh the page and try again." });
  }
}
