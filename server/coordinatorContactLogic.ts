export function normalizeCoordinatorContactDetails(phone?: string | null, email?: string | null) {
  return {
    phone: phone?.trim() || null,
    email: email?.trim().toLowerCase() || null,
  };
}
