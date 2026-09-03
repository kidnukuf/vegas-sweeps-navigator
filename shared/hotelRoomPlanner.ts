export type HotelRoomRosterRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  roommateFirstName?: string | null;
  roommateLastName?: string | null;
};

export type HotelRoomAssignment = {
  rowNumber: number;
  fullName: string;
  roomId: string;
  status: "shared_bowler" | "guest_roommate" | "solo" | "ambiguous_solo";
  roommateName: string | null;
};

export type HotelRoomGroup = {
  roomId: string;
  hasGuest: boolean;
  members: string[];
  memberRows: number[];
};

export type HotelRoomPlan = {
  assignments: HotelRoomAssignment[];
  groups: HotelRoomGroup[];
  summary: {
    rosterRows: number;
    uniqueRooms: number;
    sharedBowlerRooms: number;
    guestRooms: number;
    soloRooms: number;
    ambiguousSoloRows: number;
  };
};

function clean(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizedName(firstName: unknown, lastName: unknown): string {
  const fullName = `${clean(firstName)} ${clean(lastName)}`.trim();
  return fullName.toLocaleLowerCase();
}

function displayName(firstName: unknown, lastName: unknown): string {
  return `${clean(firstName)} ${clean(lastName)}`.trim();
}

function isPlaceholderRoommate(name: string): boolean {
  const tokens = name.toLocaleLowerCase().split(/[^a-z]+/).filter(Boolean);
  const placeholderTokens = new Set(["self", "none", "na", "notsure", "unknown", "tbd"]);
  return tokens.length === 0 || tokens.every((token) => placeholderTokens.has(token));
}

/**
 * Builds one deterministic room ID per connected exact-name roommate group.
 * A complete roommate name that does not exactly match one unique roster name
 * is treated as a non-bowler guest and receives a G suffix. Ambiguous roster
 * names and incomplete / placeholder roommate entries are conservatively solo.
 */
export function buildHotelRoomPlan(inputRows: HotelRoomRosterRow[]): HotelRoomPlan {
  const rows = inputRows.filter((row) => clean(row.firstName) && clean(row.lastName));
  const indicesByName = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = normalizedName(row.firstName, row.lastName);
    const existing = indicesByName.get(key) ?? [];
    existing.push(index);
    indicesByName.set(key, existing);
  });

  const parent = rows.map((_, index) => index);
  const find = (value: number): number => {
    let cursor = value;
    while (parent[cursor] !== cursor) cursor = parent[cursor]!;
    while (parent[value] !== value) {
      const next = parent[value]!;
      parent[value] = cursor;
      value = next;
    }
    return cursor;
  };
  const join = (first: number, second: number) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };

  const guestByRow = new Set<number>();
  const ambiguousByRow = new Set<number>();
  rows.forEach((row, index) => {
    const roommate = displayName(row.roommateFirstName, row.roommateLastName);
    const first = clean(row.roommateFirstName);
    const last = clean(row.roommateLastName);
    if (!roommate || isPlaceholderRoommate(roommate)) return;
    if (!first || !last) {
      ambiguousByRow.add(index);
      return;
    }
    const matches = indicesByName.get(normalizedName(first, last)) ?? [];
    if (matches.length === 1 && matches[0] !== index) {
      join(index, matches[0]);
    } else if (matches.length === 0) {
      guestByRow.add(index);
    } else {
      ambiguousByRow.add(index);
    }
  });

  const componentRows = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = find(index);
    const memberRows = componentRows.get(root) ?? [];
    memberRows.push(index);
    componentRows.set(root, memberRows);
  });

  const orderedComponents = Array.from(componentRows.values()).sort((first, second) => first[0]! - second[0]!);
  const roomIdByRow = new Map<number, string>();
  const groups: HotelRoomGroup[] = [];
  let nextRoomNumber = 1;

  orderedComponents.forEach((component) => {
    const hasGuest = component.some((index: number) => guestByRow.has(index));
    const roomId = `${nextRoomNumber}${hasGuest ? "G" : ""}`;
    nextRoomNumber += 1;
    component.forEach((index: number) => roomIdByRow.set(index, roomId));
    groups.push({
      roomId,
      hasGuest,
      members: component.map((index: number) => displayName(rows[index]!.firstName, rows[index]!.lastName)),
      memberRows: component.map((index: number) => rows[index]!.rowNumber),
    });
  });

  const assignments = rows.map((row, index): HotelRoomAssignment => {
    const roommate = displayName(row.roommateFirstName, row.roommateLastName);
    const group = groups.find((candidate) => candidate.roomId === roomIdByRow.get(index));
    const hasGuest = Boolean(group?.hasGuest);
    const hasSharedBowler = Boolean(group && group.memberRows.length > 1);
    return {
      rowNumber: row.rowNumber,
      fullName: displayName(row.firstName, row.lastName),
      roomId: roomIdByRow.get(index) ?? "",
      status: hasSharedBowler ? "shared_bowler" : hasGuest ? "guest_roommate" : ambiguousByRow.has(index) ? "ambiguous_solo" : "solo",
      roommateName: roommate && !isPlaceholderRoommate(roommate) ? roommate : null,
    };
  });

  return {
    assignments,
    groups,
    summary: {
      rosterRows: assignments.length,
      uniqueRooms: groups.length,
      sharedBowlerRooms: groups.filter((group) => group.memberRows.length > 1 && !group.hasGuest).length,
      guestRooms: groups.filter((group) => group.hasGuest).length,
      soloRooms: groups.filter((group) => group.memberRows.length === 1 && !group.hasGuest).length,
      ambiguousSoloRows: assignments.filter((assignment) => assignment.status === "ambiguous_solo").length,
    },
  };
}
