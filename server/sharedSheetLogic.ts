export function normalizeSpreadsheetId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([^/?#]+)/);
  return urlMatch?.[1] ?? trimmed;
}

export function resolveSharedSheetTarget(input: {
  requestedSpreadsheetId?: string | null;
  sheetTabName?: string | null;
  sharedSpreadsheetId?: string | null;
}): { spreadsheetId: string | null; sheetTabName: string | null } {
  const requestedSpreadsheetId = input.requestedSpreadsheetId?.trim() || null;
  const sharedSpreadsheetId = input.sharedSpreadsheetId?.trim() || null;
  const spreadsheetId = sharedSpreadsheetId ?? requestedSpreadsheetId;
  const sheetTabName = input.sheetTabName?.trim() || null;

  if (sharedSpreadsheetId && requestedSpreadsheetId && normalizeSpreadsheetId(requestedSpreadsheetId) !== sharedSpreadsheetId) {
    throw new Error("New events must use the shared Google Sheet. Select the event tab within that sheet instead.");
  }
  if (spreadsheetId && !sheetTabName) {
    throw new Error("Choose the Google Sheet tab for this event before saving.");
  }

  return { spreadsheetId: spreadsheetId ? normalizeSpreadsheetId(spreadsheetId) : null, sheetTabName };
}
