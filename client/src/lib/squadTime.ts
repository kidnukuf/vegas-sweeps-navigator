/**
 * Normalize squad time codes to human-readable labels.
 * M3  → Monday 3pm    (practice 2:50pm)
 * M10 → Monday 10am   (practice 9:50am)
 * T10 → Tuesday 10am  (practice 9:50am)
 */
export function normalizeSquadTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const map: Record<string, string> = {
    M3:  "Monday 3pm",
    M10: "Monday 10am",
    T10: "Tuesday 10am",
  };
  return map[raw.trim().toUpperCase()] ?? raw;
}
