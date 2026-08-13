export type RegistrationLinks = {
  bowler: string;
  captain: string;
};

export type RegistrationLinkEvent = {
  id: number | string;
  status: string | null | undefined;
};

/** Returns only active, event-scoped records that are eligible for public registration distribution. */
export function getActiveRegistrationEvents<T extends RegistrationLinkEvent>(events: T[]) {
  return events.filter((event) => event.status === "active");
}

export function createRegistrationLinks(origin: string, eventId: number): RegistrationLinks {
  const base = origin.replace(/\/$/, "");
  const query = `?event=${encodeURIComponent(String(eventId))}`;
  return {
    bowler: `${base}/bowler-login${query}`,
    captain: `${base}/captain-login${query}`,
  };
}

export function createRegistrationMessage(eventName: string, links: RegistrationLinks) {
  return `Registration links for ${eventName}\n\nBowler registration: ${links.bowler}\nTeam Captain registration: ${links.captain}`;
}
