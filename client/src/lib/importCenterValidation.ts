export type CenterPreviewRow = {
  centerName: string;
};

export function centerKey(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function findMismatchedCenterNames(
  rows: CenterPreviewRow[],
  databaseCenterNames: Iterable<string>,
  isCenterListReady: boolean,
  overrides: Record<string, string>,
): string[] {
  if (!isCenterListReady) return [];
  const databaseKeys = new Set(Array.from(databaseCenterNames, centerKey).filter(Boolean));
  const overrideKeys = new Set(Object.keys(overrides).map(centerKey));
  const mismatches = new Map<string, string>();

  for (const row of rows) {
    const value = String(row.centerName ?? "").trim();
    const key = centerKey(value);
    if (key && !databaseKeys.has(key) && !overrideKeys.has(key)) {
      mismatches.set(key, value);
    }
  }
  return Array.from(mismatches.values()).sort((left, right) => left.localeCompare(right));
}

export function applyCenterOverrideToRawRow(
  rawRow: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  const originalCenter = ["centerName", "Center", "center", "Bowling Center", "bowling_center", "BowlingCenter", "Location", "location", "Alley", "alley", "Venue", "venue"]
    .map((header) => ({ header, value: String(rawRow[header] ?? "").trim() }))
    .find(({ value }) => Boolean(value));

  if (!originalCenter) return rawRow;
  const mappedCenter = Object.entries(overrides).find(([source]) => centerKey(source) === centerKey(originalCenter.value))?.[1];
  if (!mappedCenter) return rawRow;
  return { ...rawRow, [originalCenter.header]: mappedCenter };
}
