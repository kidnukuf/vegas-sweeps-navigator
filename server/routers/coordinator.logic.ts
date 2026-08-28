export type CoordinatorRow = Record<string, unknown>;

export type RowIssue = {
  field: string;
  level: "error" | "warning";
  message: string;
};

export type ValidatedCoordinatorRow = {
  data: Record<string, string>;
  errors: RowIssue[];
  warnings: RowIssue[];
  validationStatus: "ready" | "warning" | "needs_correction";
};

export type SubmissionSummary = {
  rowCount: number;
  teamCount: number;
  readyRowCount: number;
  warningCount: number;
  errorCount: number;
  missingEmailCount: number;
  missingPhoneCount: number;
};

const fieldAliases: Record<string, string> = {
  firstname: "firstName",
  "first name": "firstName",
  legalfirstname: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  legallastname: "lastName",
  center: "center",
  centername: "center",
  leaguesession: "leagueSession",
  "league session": "leagueSession",
  leaguedaytime: "leagueSession",
  "league day time": "leagueSession",
  league: "leagueSession",
  teamnumber: "teamNumber",
  "team number": "teamNumber",
  teamname: "teamName",
  "team name": "teamName",
  captain: "captain",
  iscaptain: "captain",
  "is captain": "captain",
  email: "email",
  emailaddress: "email",
  "email address": "email",
  phone: "phone",
  phonenumber: "phone",
  "phone number": "phone",
  notes: "notes",
  initialrequest: "notes",
  lane: "lane",
  under21: "under21",
  "under 21": "under21",
  sanctionnumber: "sanctionNumber",
  "sanction number": "sanctionNumber",
  games: "games",
  bestaverage: "bestAverage",
  "best average": "bestAverage",
  shirtsize: "shirtSize",
  "shirt size": "shirtSize",
  hotelconfirmation: "hotelConfirmation",
  "hotel confirmation": "hotelConfirmation",
  hotelcheckin: "hotelCheckIn",
  "hotel check in": "hotelCheckIn",
  hotelcheckout: "hotelCheckOut",
  "hotel check out": "hotelCheckOut",
  roomtype: "roomType",
  "room type": "roomType",
  roommatename: "roommateName",
  "roommate name": "roommateName",
  specialrequestcategory: "specialRequestCategory",
  "special request category": "specialRequestCategory",
  specialrequestnote: "specialRequestNote",
  "special request note": "specialRequestNote",
  specialrequeststatus: "specialRequestStatus",
  "special request status": "specialRequestStatus",
};

const acceptedFields = new Set(Object.values(fieldAliases));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\-\s]{7,32}$/;

function cleanText(value: unknown, maxLength = 255): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function canonicalField(key: string): string | undefined {
  const cleaned = key.trim().replace(/[_.-]/g, " ").replace(/\s+/g, " ").toLowerCase();
  return fieldAliases[cleaned] ?? fieldAliases[cleaned.replace(/\s/g, "")];
}

function isAffirmative(value: string): boolean {
  return ["yes", "y", "true", "1", "captain"].includes(value.toLowerCase());
}

/** Removes non-coordinator data, then validates the minimum roster and later-completion fields. */
export function validateCoordinatorRosterRow(
  rawRow: CoordinatorRow,
  scope: { centerName?: string | null; leagueSession?: string | null },
): ValidatedCoordinatorRow {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const mapped = acceptedFields.has(key) ? key : canonicalField(key);
    if (mapped && acceptedFields.has(mapped)) data[mapped] = cleanText(value, mapped === "notes" || mapped.endsWith("Note") ? 1_000 : 255);
  }

  if (scope.centerName) data.center = cleanText(scope.centerName);
  if (scope.leagueSession) data.leagueSession = cleanText(scope.leagueSession, 100);
  if (!data.specialRequestStatus && data.specialRequestCategory) data.specialRequestStatus = "new";

  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const required = [
    ["firstName", "First name is required."],
    ["lastName", "Last name is required."],
    ["center", "An authorized center is required."],
    ["leagueSession", "League session or day/time is required."],
    ["teamNumber", "Team number is required."],
    ["teamName", "Team name is required."],
    ["captain", "Mark whether this bowler is a captain."],
  ] as const;
  for (const [field, message] of required) if (!data[field]) errors.push({ field, level: "error", message });

  if (!data.email) warnings.push({ field: "email", level: "warning", message: "Email is missing and can be completed later." });
  else if (!emailPattern.test(data.email)) warnings.push({ field: "email", level: "warning", message: "Email format should be reviewed." });
  if (!data.phone) warnings.push({ field: "phone", level: "warning", message: "Phone number is missing and can be completed later." });
  else if (!phonePattern.test(data.phone)) warnings.push({ field: "phone", level: "warning", message: "Phone format should be reviewed." });

  return {
    data,
    errors,
    warnings,
    validationStatus: errors.length ? "needs_correction" : warnings.length ? "warning" : "ready",
  };
}

/** Keeps assignments within an Event Director-issued coordinator scope. */
export function isLeagueSessionAllowed(allowedSessions: unknown, submittedSession?: string | null): boolean {
  if (!submittedSession?.trim()) return true;
  if (!Array.isArray(allowedSessions) || allowedSessions.length === 0) return true;
  const target = submittedSession.trim().toLowerCase();
  return allowedSessions.some((value) => cleanText(value, 100).toLowerCase() === target);
}

export function summarizeCoordinatorRows(rows: ValidatedCoordinatorRow[]): SubmissionSummary {
  const teamKeys = new Set<string>();
  let warningCount = 0;
  let errorCount = 0;
  let missingEmailCount = 0;
  let missingPhoneCount = 0;
  let readyRowCount = 0;
  for (const row of rows) {
    teamKeys.add(`${row.data.leagueSession ?? ""}|${row.data.teamNumber ?? ""}|${row.data.teamName ?? ""}`);
    warningCount += row.warnings.length;
    errorCount += row.errors.length;
    if (!row.data.email) missingEmailCount += 1;
    if (!row.data.phone) missingPhoneCount += 1;
    if (!row.errors.length) readyRowCount += 1;
  }
  return { rowCount: rows.length, teamCount: [...teamKeys].filter(Boolean).length, readyRowCount, warningCount, errorCount, missingEmailCount, missingPhoneCount };
}

export function hasRosterReadinessErrors(rows: ValidatedCoordinatorRow[]): boolean {
  const captainTeams = new Map<string, boolean>();
  for (const row of rows) {
    if (row.errors.length) return true;
    const key = `${row.data.leagueSession ?? ""}|${row.data.teamNumber ?? ""}|${row.data.teamName ?? ""}`;
    captainTeams.set(key, Boolean(captainTeams.get(key)) || isAffirmative(row.data.captain ?? ""));
  }
  return [...captainTeams.values()].some((hasCaptain) => !hasCaptain);
}

export function isInvitationRedeemable(invitation: { redeemedAt?: Date | string | null; revokedAt?: Date | string | null; expiresAt: Date | string }, now = new Date()): boolean {
  return !invitation.redeemedAt && !invitation.revokedAt && new Date(invitation.expiresAt).getTime() > now.getTime();
}

const coordinatorEditableStatuses = new Set(["draft", "needs_coordinator_follow_up", "initial_imported", "draft_after_initial_import", "needs_coordinator_final_follow_up"]);

export function canCoordinatorEditSubmission(status: string | null | undefined): boolean {
  return !status || coordinatorEditableStatuses.has(status);
}

export function canSubmitForEdReview(status: string | null | undefined): boolean {
  return canCoordinatorEditSubmission(status);
}

export function canEdMarkReadyForInitialImport(status: string | null | undefined): boolean {
  return status === "submitted_for_ed_review" || status === "needs_coordinator_follow_up" || status === "draft";
}

export function isPostInitialImportStatus(status: string | null | undefined): boolean {
  return ["initial_imported", "draft_after_initial_import", "needs_coordinator_final_follow_up", "submitted_for_final_ed_review"].includes(status ?? "");
}

export function canEdMarkReadyForFinalImport(status: string | null | undefined): boolean {
  return status === "submitted_for_final_ed_review" || status === "needs_coordinator_final_follow_up" || status === "draft_after_initial_import";
}

export function canOwnerRecordInitialImport(status: string | null | undefined): boolean {
  return status === "ready_for_owner_initial_import";
}

export function canOwnerRecordFinalImport(status: string | null | undefined): boolean {
  return status === "ready_for_owner_final_import";
}

export function isAffirmativeCaptain(value: string | null | undefined): boolean {
  return isAffirmative(value ?? "");
}
