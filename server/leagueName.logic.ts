export function normalizeLeagueCode(value: string): string | null {
  const digits = value.trim().replace(/\D/g, "");
  if (!digits || digits.length > 2) return null;
  const numeric = Number(digits);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 99) return null;
  return String(numeric).padStart(2, "0");
}

export function normalizeLeagueName(value: string | null | undefined, leagueCode: string): string {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return normalized || `League ${leagueCode}`;
}
