export function resolveGoogleCredentialStatus(
  savedCredentialJson: string | null | undefined,
  deploymentCredentialJson: string | null | undefined,
): { saved: boolean; clientEmail: string | null } {
  const raw = savedCredentialJson?.trim() || deploymentCredentialJson?.trim() || null;
  if (!raw) return { saved: false, clientEmail: null };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { saved: true, clientEmail: typeof parsed.client_email === "string" ? parsed.client_email : null };
  } catch {
    // The app still has a configured value; callers should treat its validity
    // separately instead of incorrectly telling Event Directors no credentials exist.
    return { saved: true, clientEmail: null };
  }
}
