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
  {
    name: string;
    color: string;
    accent: string;
    description: string;
    isMultiEvent: boolean;
    logoUrl?: string;
    bannerUrl?: string;
    icon192?: string;
    icon512?: string;
    faviconUrl?: string;
    bgColor?: string;
  }
> = {
  bob: {
    name: "B.O.B. Roll-off Passport",
    color: "#ffd700",
    accent: "#b8860b",
    description: "Bowlers Orleans Bound — Annual Flagship Event",
    isMultiEvent: false,
    logoUrl: "/manus-storage/bob-logo_c7d62f79.jpg",
    bannerUrl: "/manus-storage/bob-logo_c7d62f79.jpg",
    icon192: "/icon-192.png",
    icon512: "/icon-512.png",
    faviconUrl: "/favicon.ico",
    bgColor: "#0d0d0d",
  },
  valentine: {
    name: "Valentine Funtime",
    color: "#e91e8c",
    accent: "#c2185b",
    description: "Valentine Funtime Roll-off — February Event",
    isMultiEvent: false,
    logoUrl: "/manus-storage/valentine-logo-1_ace6cce5.jpg",
    bannerUrl: "/manus-storage/valentine-logo-2_51b648e0.jpg",
    icon192: "/manus-storage/valentine-icon-192_be6ddb33.png",
    icon512: "/manus-storage/valentine-icon-512_1226a666.png",
    faviconUrl: "/manus-storage/valentine-favicon_1fbd211d.ico",
    bgColor: "#1a0020",
  },
  "june-funtime": {
    name: "June Funtime Roll-Off",
    color: "#d4af37",
    accent: "#4a0e8f",
    description: "June Funtime Bowling Event — Mardi Gras Hotel & Casino",
    isMultiEvent: true,
    logoUrl: "/manus-storage/june-logo-1_a6163a08.jpg",
    bannerUrl: "/manus-storage/june-logo-2_937344ed.jpg",
    icon192: "/manus-storage/june-icon-192_719215b4.png",
    icon512: "/manus-storage/june-icon-512_0b7c52c3.png",
    faviconUrl: "/manus-storage/june-favicon-32_21b28f14.png",
    bgColor: "#1a0a2e",
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
