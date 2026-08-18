export function normalizeEventIds(eventIds: number[]) {
  return Array.from(new Set(eventIds.filter((eventId) => Number.isInteger(eventId) && eventId > 0)));
}

export function portfolioMatchesCompany(eventCompanyIds: Array<number | null>, companyId: number) {
  return eventCompanyIds.every((eventCompanyId) => eventCompanyId === companyId);
}
