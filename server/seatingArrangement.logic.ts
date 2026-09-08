import { createHash } from "node:crypto";

export type SeatingArrangementAssignment = {
  scantronId: string;
  tableNumber: number;
};

export type SeatingArrangementSheetPlan = {
  headerNeedsAdd: boolean;
  columnIssue: string | null;
  missingBowlerIds: string[];
  duplicateBowlerIds: string[];
  duplicateAssignments: string[];
  updates: Array<{ rowNumber: number; tableNumber: number }>;
};

const BOWLER_ID_HEADER = "bowler id";
const SEATING_ARRANGEMENT_HEADER = "seating arrangement";
const SEATING_ARRANGEMENT_COLUMN = 67; // BP, zero-based.

export function normalizeSeatingSheetText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeSeatingBowlerId(value: unknown): string {
  return String(value ?? "").trim().replace(/[-\s]/g, "").toUpperCase();
}

export function snapshotSeatingSheet(sheetName: string, rows: string[][]): string {
  return createHash("sha256")
    .update(JSON.stringify({ sheetName, rows }))
    .digest("hex");
}

/**
 * Plans a BP-only write. It never mutates the source matrix, and treats any
 * nonblank BP header other than Seating Arrangement as a hard stop.
 */
export function buildSeatingArrangementSheetPlan(
  rows: string[][],
  assignments: SeatingArrangementAssignment[],
): SeatingArrangementSheetPlan {
  const headers = rows[0] ?? [];
  const bowlerIdColumn = headers.findIndex((header) => normalizeSeatingSheetText(header) === BOWLER_ID_HEADER);
  const bpHeader = normalizeSeatingSheetText(headers[SEATING_ARRANGEMENT_COLUMN]);
  const columnIssue = bowlerIdColumn < 0
    ? "The selected tab does not contain a Bowler ID column."
    : (bpHeader && bpHeader !== SEATING_ARRANGEMENT_HEADER
      ? `BP is already labeled "${String(headers[SEATING_ARRANGEMENT_COLUMN]).trim()}" and will not be overwritten.`
      : null);

  const rowByBowlerId = new Map<string, number>();
  const duplicateBowlerIds = new Set<string>();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const bowlerId = normalizeSeatingBowlerId(rows[rowIndex]?.[bowlerIdColumn]);
    if (!bowlerId) continue;
    if (rowByBowlerId.has(bowlerId)) duplicateBowlerIds.add(bowlerId);
    else rowByBowlerId.set(bowlerId, rowIndex + 1);
  }

  const assignmentByBowlerId = new Map<string, SeatingArrangementAssignment>();
  const duplicateAssignments = new Set<string>();
  for (const assignment of assignments) {
    const bowlerId = normalizeSeatingBowlerId(assignment.scantronId);
    if (!bowlerId) continue;
    if (assignmentByBowlerId.has(bowlerId)) duplicateAssignments.add(bowlerId);
    assignmentByBowlerId.set(bowlerId, { ...assignment, scantronId: bowlerId });
  }

  const missingBowlerIds: string[] = [];
  const updates: Array<{ rowNumber: number; tableNumber: number }> = [];
  for (const [bowlerId, assignment] of Array.from(assignmentByBowlerId.entries())) {
    const rowNumber = rowByBowlerId.get(bowlerId);
    if (!rowNumber || duplicateBowlerIds.has(bowlerId)) {
      missingBowlerIds.push(bowlerId);
      continue;
    }
    updates.push({ rowNumber, tableNumber: assignment.tableNumber });
  }

  return {
    headerNeedsAdd: !bpHeader,
    columnIssue,
    missingBowlerIds: missingBowlerIds.sort(),
    duplicateBowlerIds: Array.from(duplicateBowlerIds).sort(),
    duplicateAssignments: Array.from(duplicateAssignments).sort(),
    updates: updates.sort((a, b) => a.rowNumber - b.rowNumber),
  };
}
