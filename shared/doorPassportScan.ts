export const DOOR_MODES = ["pool", "banquet"] as const;
export const PASSPORT_TYPES = ["pool", "banquet", "guest-pool", "guest-banquet"] as const;

export type DoorMode = (typeof DOOR_MODES)[number];
export type PassportType = (typeof PASSPORT_TYPES)[number];

export type DoorPassportScan = {
  tokenValue: string;
  passportType: PassportType;
};

/**
 * A QR URL carries the pass type, so a single scanner input can accept both
 * bowler and guest passes. A bare token is treated as the pass type selected
 * for the physical door.
 */
export function resolveDoorPassportScan(rawValue: string, selectedDoor: DoorMode): DoorPassportScan | null {
  const value = rawValue.trim();
  if (!value) return null;
  const match = value.match(/\/scan\/(guest-banquet|guest-pool|pool|banquet)\/([^/?#\s]+)/i);
  if (!match) return { tokenValue: value, passportType: selectedDoor };
  return {
    passportType: match[1].toLowerCase() as PassportType,
    tokenValue: decodeURIComponent(match[2]).trim(),
  };
}

/** Only a pass for the current physical door may be redeemed at that door. */
export function isPassportTypeAllowedAtDoor(passportType: PassportType, doorMode: DoorMode): boolean {
  return doorMode === "pool"
    ? passportType === "pool" || passportType === "guest-pool"
    : passportType === "banquet" || passportType === "guest-banquet";
}

export function doorLabel(doorMode: DoorMode): string {
  return doorMode === "pool" ? "Pool Party" : "Banquet";
}
