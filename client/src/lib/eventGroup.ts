/**
 * Event Group / Domain Detection Utility
 *
 * Three websites:
 *   1. bobrolloffpassport.com          → slug: "bob"
 *   2. www.vegasvalentinefuntime.com   → slug: "valentine"
 *   3. www.funtimeteamchallenge.com    → slug: "june-group-1" | "june-group-2" | "june-group-3" | "june-group-4"
 *      Group is determined by /group/N path segment or sessionStorage selection.
 *
 * Falls back to "bob" on unknown domains (localhost, dev preview).
 */

export type GroupSlug =
  | "bob"
  | "valentine"
  | "june-group-1"
  | "june-group-2"
  | "june-group-3"
  | "june-group-4";

/** Which website/brand does this hostname belong to? */
export type WebsiteBrand = "bob" | "valentine" | "june";

export const JUNE_GROUP_KEY = "juneGroupNumber";

const DOMAIN_BRAND_MAP: Record<string, WebsiteBrand> = {
  "bobrolloffpassport.com": "bob",
  "www.bobrolloffpassport.com": "bob",
  // old domain still supported
  "valentinefuntime.com": "valentine",
  "www.valentinefuntime.com": "valentine",
  // new domain
  "vegasvalentinefuntime.com": "valentine",
  "www.vegasvalentinefuntime.com": "valentine",
  // june team challenge
  "funtimeteamchallenge.com": "june",
  "www.funtimeteamchallenge.com": "june",
  // old june domain still supported
  "junefuntimerolloff.com": "june",
  "www.junefuntimerolloff.com": "june",
};

/** Returns the website brand for the current hostname. */
export function detectWebsiteBrand(): WebsiteBrand {
  const host = window.location.hostname.toLowerCase();
  return DOMAIN_BRAND_MAP[host] ?? "bob";
}

/**
 * Returns the group number (1-4) for the June website.
 * Checks URL path (/group/2) first, then sessionStorage.
 * Returns null if not yet selected.
 */
export function detectJuneGroupNumber(): number | null {
  // Check URL path: /group/1, /group/2, etc.
  const match = window.location.pathname.match(/\/group\/([1-4])/);
  if (match) {
    const n = parseInt(match[1], 10);
    sessionStorage.setItem(JUNE_GROUP_KEY, String(n));
    return n;
  }
  // Check sessionStorage (user already selected)
  const stored = sessionStorage.getItem(JUNE_GROUP_KEY);
  if (stored) return parseInt(stored, 10);
  return null;
}

/** Set the selected June group number in sessionStorage */
export function setJuneGroupNumber(n: number): void {
  sessionStorage.setItem(JUNE_GROUP_KEY, String(n));
}

/** Clear the selected June group number */
export function clearJuneGroupNumber(): void {
  sessionStorage.removeItem(JUNE_GROUP_KEY);
}

/** Returns the full group slug for the current domain + group selection. */
export function detectGroupSlug(): GroupSlug {
  const brand = detectWebsiteBrand();
  if (brand === "valentine") return "valentine";
  if (brand === "june") {
    const n = detectJuneGroupNumber();
    if (n && n >= 1 && n <= 4) return `june-group-${n}` as GroupSlug;
    return "june-group-1"; // fallback until user selects
  }
  return "bob";
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
  "june-group-1": {
    name: "Funtime Team Challenge — Group 1",
    color: "#d4af37",
    accent: "#4a0e8f",
    description: "June Funtime Team Challenge — Group 1",
    isMultiEvent: false,
    logoUrl: "/manus-storage/june-logo-1_a6163a08.jpg",
    bannerUrl: "/manus-storage/june-logo-2_937344ed.jpg",
    icon192: "/manus-storage/june-icon-192_719215b4.png",
    icon512: "/manus-storage/june-icon-512_0b7c52c3.png",
    faviconUrl: "/manus-storage/june-favicon-32_21b28f14.png",
    bgColor: "#1a0a2e",
  },
  "june-group-2": {
    name: "Funtime Team Challenge — Group 2",
    color: "#d4af37",
    accent: "#4a0e8f",
    description: "June Funtime Team Challenge — Group 2",
    isMultiEvent: false,
    logoUrl: "/manus-storage/june-logo-1_a6163a08.jpg",
    bannerUrl: "/manus-storage/june-logo-2_937344ed.jpg",
    icon192: "/manus-storage/june-icon-192_719215b4.png",
    icon512: "/manus-storage/june-icon-512_0b7c52c3.png",
    faviconUrl: "/manus-storage/june-favicon-32_21b28f14.png",
    bgColor: "#1a0a2e",
  },
  "june-group-3": {
    name: "Funtime Team Challenge — Group 3",
    color: "#d4af37",
    accent: "#4a0e8f",
    description: "June Funtime Team Challenge — Group 3",
    isMultiEvent: false,
    logoUrl: "/manus-storage/june-logo-1_a6163a08.jpg",
    bannerUrl: "/manus-storage/june-logo-2_937344ed.jpg",
    icon192: "/manus-storage/june-icon-192_719215b4.png",
    icon512: "/manus-storage/june-icon-512_0b7c52c3.png",
    faviconUrl: "/manus-storage/june-favicon-32_21b28f14.png",
    bgColor: "#1a0a2e",
  },
  "june-group-4": {
    name: "Funtime Team Challenge — Group 4",
    color: "#d4af37",
    accent: "#4a0e8f",
    description: "June Funtime Team Challenge — Group 4",
    isMultiEvent: false,
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
