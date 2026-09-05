/**
 * Guest Name and Additional Guest Name cells may arrive with a price or count
 * before the Event Director has supplied the guest's actual name. Those values
 * must never be presented as a guest identity in the Bowler Portal.
 */
const NUMERIC_OR_CURRENCY_VALUE = /^\$?\s*\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?\s*$/;

export function isIncompleteGuestName(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 || NUMERIC_OR_CURRENCY_VALUE.test(trimmed);
}

export function normalizeGuestName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function splitImportedGuestEntry(value: string | null | undefined): {
  guestName: string | null;
  guestAmountPaid: string | null;
} {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { guestName: null, guestAmountPaid: null };
  if (NUMERIC_OR_CURRENCY_VALUE.test(trimmed)) {
    return { guestName: null, guestAmountPaid: trimmed };
  }
  return { guestName: normalizeGuestName(trimmed), guestAmountPaid: null };
}
