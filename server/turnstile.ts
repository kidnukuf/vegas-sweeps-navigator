import { TRPCError } from "@trpc/server";

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY ?? "";
const TURNSTILE_HOSTNAMES = new Set(
  (process.env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean),
);

type TurnstileVerificationResult = {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/**
 * Verify a Cloudflare Turnstile assertion before allowing a public auth action.
 * Local tests may mock this module; production requires the server secret,
 * an expected action, and a hostname returned by Cloudflare's siteverify API.
 */
export async function verifyTurnstileToken(token: string, ip: string | undefined, expectedAction: string): Promise<void> {
  if (!TURNSTILE_SECRET) {
    if (process.env.NODE_ENV !== "production") return;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Security verification is not configured. Please contact your Event Director." });
  }

  if (!token || token.length > 2048 || !expectedAction || TURNSTILE_HOSTNAMES.size === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Security check failed. Please refresh the page and try again." });
  }

  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });

  let result: TurnstileVerificationResult;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    result = await response.json() as TurnstileVerificationResult;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Security check could not be verified. Please try again." });
  }

  const returnedHostname = result.hostname?.trim().toLowerCase();
  if (!result.success || result.action !== expectedAction || !returnedHostname || !TURNSTILE_HOSTNAMES.has(returnedHostname)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Security check failed. Please refresh the page and try again." });
  }
}
