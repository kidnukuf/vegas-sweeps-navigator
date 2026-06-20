/**
 * Event Group / Domain Detection Utility
 *
 * Maps the current hostname to an event group slug.
 * Falls back to "bob" (the flagship event) on unknown domains (e.g. localhost, dev preview).
 */

export type GroupSlug = "bob" | "valentine" | "june-funtime";

const DOMAIN_MAP: Record<string, GroupSlug> = {
  "bobrolloffpassport.com": "bob",
  "www.bobrolloffpassport.com": "bob",
  "valentinefuntime.com": "valentine",
  "www.valentinefuntime.com": "valentine",
  "junefuntimerolloff.com": "june-funtime",
  "www.junefuntimerolloff.com": "june-funtime",
};

/** Returns the group slug for the current hostname. */
export function detectGroupSlug(): GroupSlug {
  const host = window.location.hostname.toLowerCase();
  return DOMAIN_MAP[host] ?? "bob";
}

/** Theme config per group */
export const GROUP_THEMES: Record<
  GroupSlug,
  { name: string; color: string; accent: string; description: string; isMultiEvent: boolean }
> = {
  bob: {
    name: "B.O.B. Roll-off Passport",
    color: "#ffd700",
    accent: "#b8860b",
    description: "Bowlers Orleans Bound — Annual Flagship Event",
    isMultiEvent: false,
  },
  valentine: {
    name: "Valentine Funtime",
    color: "#e91e8c",
    accent: "#c2185b",
    description: "Valentine Funtime Roll-off — February Event",
    isMultiEvent: false,
  },
  "june-funtime": {
    name: "June Funtime Roll-Off",
    color: "#00bcd4",
    accent: "#0097a7",
    description: "June Funtime Roll-Off — 4 Leagues",
    isMultiEvent: true,
  },
};

/** Session storage key for the selected eventId */
export const SELECTED_EVENT_ID_KEY = "selectedEventId";

/** Get the currently selected event ID from session storage */
export function getSelectedEventId(): number | null {
  const val = sessionStorage.getItem(SELECTED_EVENT_ID_KEY);
  return val ? parseInt(val, 10) : null;
}

/** Set the selected event ID in session storage */
export function setSelectedEventId(eventId: number): void {
  sessionStorage.setItem(SELECTED_EVENT_ID_KEY, String(eventId));
}

/** Clear the selected event ID */
export function clearSelectedEventId(): void {
  sessionStorage.removeItem(SELECTED_EVENT_ID_KEY);
}
