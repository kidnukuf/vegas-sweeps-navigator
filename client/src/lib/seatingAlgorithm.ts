/**
 * Funtime Team Challenge Seating Algorithm
 *
 * ID format: CC(2) LL(2) EE(2) TT(2) BB(2) = 10 digits
 * Guest IDs: 11 chars = 10-digit bowler ID + letter suffix (A, B, C...)
 *
 * Rules:
 * 1. Bowlers from different centers (CC) must NEVER share a table
 * 2. Balancing is done independently per (center, league) group
 * 3. Minimize spread: distribute as evenly as possible across tables
 * 4. Guests must be seated immediately adjacent to their linked bowler
 * 5. Max 80 tables, default 8 seats per table
 */

export interface SeatingRow {
  originalIndex: number; // 0-based row index in uploaded file
  rawId: string;         // raw ID string from file
  name: string;          // bowler/guest display name
  isGuest: boolean;
  linkedBowlerId: string | null; // for guests: the 10-digit host ID
  guestSuffix: string | null;    // A, B, C...
  cc: string;   // center code
  ll: string;   // league code
  ee: string;   // event year
  tt: string;   // team number
  bb: string;   // bowler position
}

export interface SeatAssignment {
  originalIndex: number;
  rawId: string;
  name: string;
  tableNum: number;   // 1–80
  seatLetter: string; // A–H (or more if seats > 8)
  seatCode: string;   // e.g. "04-H"
  cc: string;
  ll: string;
  isGuest: boolean;
}

export interface SeatingResult {
  assignments: SeatAssignment[];
  /** assignments indexed by originalIndex for O(1) lookup */
  byOriginalIndex: Map<number, SeatAssignment>;
  /** tables used: tableNum → list of assignments */
  tableMap: Map<number, SeatAssignment[]>;
  warnings: string[];
}

// ─── Venue Grid ──────────────────────────────────────────────────────────────
/**
 * Build the ordered list of 80 table numbers according to the spec:
 *
 * Left section (cols 1–7, tables 1–41):
 *   Col 1: rows 1–5 (5 tables, row 6 blocked)
 *   Cols 2–7: rows 1–6 (6 tables each)
 *
 * Right section (cols 8–14, tables 42–80):
 *   Col 8: rows 2–6 (5 tables, row 1 blocked)
 *   Cols 9–12: rows 1–6 (6 tables each)
 *   Cols 13–14: rows 1–5 (5 tables each, row 6 blocked)
 *
 * Numbering flows DOWN each column, left to right.
 */
export function buildVenueGrid(): number[][] {
  // Returns a 14-column array; each entry is an ordered list of table numbers
  // in that column (top to bottom). Empty slots are represented by 0.
  const grid: number[][] = [];
  let tableNum = 1;

  // Left section: cols 0–6 (1-indexed: 1–7)
  for (let col = 0; col < 7; col++) {
    const rows = col === 0 ? 5 : 6; // col 1 has only 5 tables
    const colTables: number[] = [];
    for (let r = 0; r < rows; r++) {
      colTables.push(tableNum++);
    }
    grid.push(colTables);
  }

  // Right section: cols 7–13 (1-indexed: 8–14)
  for (let col = 0; col < 7; col++) {
    let rows: number;
    if (col === 0) rows = 5;       // col 8: row 1 blocked
    else if (col <= 3) rows = 6;   // cols 9–12: full
    else rows = 5;                  // cols 13–14: row 6 blocked
    const colTables: number[] = [];
    for (let r = 0; r < rows; r++) {
      colTables.push(tableNum++);
    }
    grid.push(colTables);
  }

  return grid; // 14 columns
}

// ─── ID Parsing ──────────────────────────────────────────────────────────────
export function parseRow(rawId: string, name: string, originalIndex: number): SeatingRow | null {
  const cleaned = rawId.replace(/[-\s]/g, '');
  if (cleaned.length === 11 && /^[0-9]{10}[A-Za-z]$/.test(cleaned)) {
    // Guest
    return {
      originalIndex,
      rawId,
      name,
      isGuest: true,
      linkedBowlerId: cleaned.slice(0, 10),
      guestSuffix: cleaned[10].toUpperCase(),
      cc: cleaned.slice(0, 2),
      ll: cleaned.slice(2, 4),
      ee: cleaned.slice(4, 6),
      tt: cleaned.slice(6, 8),
      bb: cleaned.slice(8, 10),
    };
  }
  if (cleaned.length === 10 && /^[0-9]{10}$/.test(cleaned)) {
    return {
      originalIndex,
      rawId,
      name,
      isGuest: false,
      linkedBowlerId: null,
      guestSuffix: null,
      cc: cleaned.slice(0, 2),
      ll: cleaned.slice(2, 4),
      ee: cleaned.slice(4, 6),
      tt: cleaned.slice(6, 8),
      bb: cleaned.slice(8, 10),
    };
  }
  return null; // unparseable
}

// ─── Seat Letters ─────────────────────────────────────────────────────────────
const SEAT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function seatLetter(index: number): string {
  return SEAT_LETTERS[index] ?? `?${index}`;
}
export function formatSeatCode(tableNum: number, seatIdx: number): string {
  return `${String(tableNum).padStart(2, '0')}-${seatLetter(seatIdx)}`;
}

// ─── Balancing ────────────────────────────────────────────────────────────────
/**
 * Given N people and a max seats-per-table, return an array of table sizes
 * that minimizes the spread (max - min) while filling as few tables as possible.
 *
 * Example: 20 people, 8 seats → [7, 7, 6]
 */
export function balancedTableSizes(count: number, maxSeats: number): number[] {
  if (count <= 0) return [];
  const numTables = Math.ceil(count / maxSeats);
  const base = Math.floor(count / numTables);
  const remainder = count % numTables;
  // remainder tables get (base + 1), the rest get base
  const sizes: number[] = [];
  for (let i = 0; i < numTables; i++) {
    sizes.push(i < remainder ? base + 1 : base);
  }
  return sizes;
}

// ─── Main Algorithm ───────────────────────────────────────────────────────────
export function runSeatingAlgorithm(
  rows: SeatingRow[],
  maxSeatsPerTable: number,
  maxTables: number
): SeatingResult {
  const warnings: string[] = [];
  const assignments: SeatAssignment[] = [];
  const tableMap = new Map<number, SeatAssignment[]>();

  // Separate bowlers and guests
  const bowlers = rows.filter(r => !r.isGuest);
  const guests = rows.filter(r => r.isGuest);

  // Build a map: bowlerId → SeatingRow for quick guest→host lookup
  const bowlerById = new Map<string, SeatingRow>();
  for (const b of bowlers) {
    const cleanId = b.rawId.replace(/[-\s]/g, '');
    bowlerById.set(cleanId, b);
  }

  // Group bowlers by (cc, ll) — center + league
  const groups = new Map<string, SeatingRow[]>();
  for (const b of bowlers) {
    const key = `${b.cc}-${b.ll}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }

  // Attach guests to their host bowler
  const guestsByHost = new Map<string, SeatingRow[]>();
  for (const g of guests) {
    const hostId = g.linkedBowlerId!;
    if (!guestsByHost.has(hostId)) guestsByHost.set(hostId, []);
    guestsByHost.get(hostId)!.push(g);
  }

  // Assign tables sequentially
  let nextTable = 1;

  for (const [groupKey, groupBowlers] of Array.from(groups.entries())) {
    // Build expanded list: each bowler followed immediately by their guests
    const expanded: SeatingRow[] = [];
    for (const b of groupBowlers) {
      expanded.push(b);
      const cleanId = b.rawId.replace(/[-\s]/g, '');
      const myGuests = guestsByHost.get(cleanId) ?? [];
      expanded.push(...myGuests);
    }

    const totalPeople = expanded.length;
    const sizes = balancedTableSizes(totalPeople, maxSeatsPerTable);

    if (nextTable + sizes.length - 1 > maxTables) {
      warnings.push(
        `Group ${groupKey} needs ${sizes.length} tables but only ${maxTables - nextTable + 1} remain. Some bowlers may be unassigned.`
      );
    }

    let personIdx = 0;
    for (const tableSize of sizes) {
      if (nextTable > maxTables) {
        warnings.push(`Reached max table limit (${maxTables}). ${totalPeople - personIdx} people from group ${groupKey} could not be seated.`);
        break;
      }

      const tableNum = nextTable++;
      if (!tableMap.has(tableNum)) tableMap.set(tableNum, []);

      for (let seat = 0; seat < tableSize && personIdx < expanded.length; seat++, personIdx++) {
        const person = expanded[personIdx];
        const assignment: SeatAssignment = {
          originalIndex: person.originalIndex,
          rawId: person.rawId,
          name: person.name,
          tableNum,
          seatLetter: seatLetter(seat),
          seatCode: formatSeatCode(tableNum, seat),
          cc: person.cc,
          ll: person.ll,
          isGuest: person.isGuest,
        };
        assignments.push(assignment);
        tableMap.get(tableNum)!.push(assignment);
      }
    }
  }

  // Handle any guests whose host was not found (orphan guests)
  for (const g of guests) {
    const hostId = g.linkedBowlerId!;
    if (!bowlerById.has(hostId)) {
      warnings.push(`Guest ${g.name} (${g.rawId}) has no matching host bowler in the uploaded data. Skipped.`);
    }
  }

  // Build byOriginalIndex map
  const byOriginalIndex = new Map<number, SeatAssignment>();
  for (const a of assignments) {
    byOriginalIndex.set(a.originalIndex, a);
  }

  return { assignments, byOriginalIndex, tableMap, warnings };
}

// ─── League Colors ────────────────────────────────────────────────────────────
export const LEAGUE_COLORS: Record<string, string> = {
  '01': '#1a3a8f', // Dark Blue
  '02': '#c0392b', // Red
  '03': '#e67e22', // Orange
  '04': '#27ae60', // Light Green
  '05': '#8e44ad', // Purple
  '06': '#f1c40f', // Yellow
  '07': '#3498db', // Sky Blue
  '08': '#2ecc71', // Green
  '09': '#ff69b4', // Pink
  '10': '#795548', // Brown
  '11': '#6b8e23', // Avocado Green
  '12': '#212121', // Black
  '13': '#b39ddb', // Lavender
  '14': '#8b0000', // Crimson
  '15': '#ffd700', // Gold
  '16': '#c0c0c0', // Silver
  '17': '#cd7f32', // Bronze
  '18': '#d2b48c', // Tan
  '19': '#9e9e9e', // Gray
};

export function leagueColor(ll: string): string {
  return LEAGUE_COLORS[ll] ?? '#555555';
}

export const LEAGUE_NAMES: Record<string, string> = {
  '01': 'League 01 — Dark Blue',
  '02': 'League 02 — Red',
  '03': 'League 03 — Orange',
  '04': 'League 04 — Light Green',
  '05': 'League 05 — Purple',
  '06': 'League 06 — Yellow',
  '07': 'League 07 — Sky Blue',
  '08': 'League 08 — Green',
  '09': 'League 09 — Pink',
  '10': 'League 10 — Brown',
  '11': 'League 11 — Avocado Green',
  '12': 'League 12 — Black',
  '13': 'League 13 — Lavender',
  '14': 'League 14 — Crimson',
  '15': 'League 15 — Gold',
  '16': 'League 16 — Silver',
  '17': 'League 17 — Bronze',
  '18': 'League 18 — Tan',
  '19': 'League 19 — Gray',
};
