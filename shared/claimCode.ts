/** Format manual entry, pasted codes, and prefilled registration links consistently. */
export function formatClaimCode(value: string): string {
  const clean = value.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (clean.length < 3) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

/** Normalize recognized undashed codes without discarding invalid extra characters. */
export function normalizeClaimCode(value: string | null | undefined): string {
  const clean = (value ?? "").trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-");
  return /^[A-Z]{3}[A-Z0-9]+$/.test(clean)
    ? `${clean.slice(0, 3)}-${clean.slice(3)}`
    : clean;
}
