export const MASTER_PASTE_HEADERS = [
  "Bowler ID", "Phone", "Email", "Squad Day & Time", "Lane #", "Center", "Coordinator", "Team #", "Captain", "First Name", "Last Name", "Under 21?", "Sanction #", "# Games", "Best Avg", "Team Name", "League Member", "T-Shirt Size", "Hotel Confirmation", "Check In", "Check Out", "Roommate First Name", "Roommate Last Name", "2nd Squad Time", "2nd Lane #", "Pool QR", "Pool Used", "Banquet QR", "Banquet Used", "#A Pool QR", "#A Pool Used", "#A Banquet QR", "#A Banquet Used", "#B Pool QR", "#B Pool Used", "#B Banquet QR", "#B Banquet Used", "2nd Banquet QR", "2nd Banquet Used", "2nd Pool QR", "2nd Pool Used", "Q1 Overall Experience?", "Q1 answer", "Q2 Bowling Venue?", "Q2 Answer", "Q3 Event Organization?", "Q3 Answer", "Q4 Pool Party? (If applicable)", "Q4 Answer", "Q5 Banquet Experience?", "Q5 Answer", "Q6 This App?", "Q6 Answer", "Q7 League App Interest?", "Q7 Answer", "Q8 Additional Comments or Concerns", "Q8 Answer", "Q9 Testimonial Permission?", "Q9 Answer", "Q10 Attend Next Year?", "Q10 Answer", "Guest Name", "Additional Guest", "Claim Code", "Bill Breakdown", "Team Score",
] as const;

export const MASTER_PASTE_PROTECTED_HEADERS = new Set<string>([
  "Pool QR", "Pool Used", "Banquet QR", "Banquet Used", "#A Pool QR", "#A Pool Used", "#A Banquet QR", "#A Banquet Used", "#B Pool QR", "#B Pool Used", "#B Banquet QR", "#B Banquet Used", "2nd Banquet QR", "2nd Banquet Used", "2nd Pool QR", "2nd Pool Used", "Q1 Overall Experience?", "Q1 answer", "Q2 Bowling Venue?", "Q2 Answer", "Q3 Event Organization?", "Q3 Answer", "Q4 Pool Party? (If applicable)", "Q4 Answer", "Q5 Banquet Experience?", "Q5 Answer", "Q6 This App?", "Q6 Answer", "Q7 League App Interest?", "Q7 Answer", "Q8 Additional Comments or Concerns", "Q8 Answer", "Q9 Testimonial Permission?", "Q9 Answer", "Q10 Attend Next Year?", "Q10 Answer", "Guest Name", "Additional Guest", "Claim Code", "Bill Breakdown", "Team Score",
]);

export type CoordinatorStatus = "New" | "Update" | "Merge-2nd-squad" | "Error";

export type CenterCodeLookup = {
  centerName: string;
  centerCode: string | number | null | undefined;
};

export type CoordinatorRow = {
  sourceRow: number;
  raw: Record<string, string>;
  bowlerId: string;
  phone: string;
  email: string;
  squadTime: string;
  lane: string;
  center: string;
  coordinator: string;
  team: string;
  captain: string;
  firstName: string;
  lastName: string;
  under21: string;
  sanctionNumber: string;
  games: string;
  bestAverage: string;
  teamName: string;
  leagueMember: string;
  shirtSize: string;
  hotelConfirmation: string;
  checkIn: string;
  checkOut: string;
  roommateFirstName: string;
  roommateLastName: string;
  secondSquadTime: string;
  secondLane: string;
  bowlerPosition: string;
  errors: string[];
  generatedId: string;
};

export type CoordinatorPreviewRow = {
  sourceRows: number[];
  status: CoordinatorStatus;
  bowlerId: string;
  firstName: string;
  lastName: string;
  center: string;
  team: string;
  squadTime: string;
  reason?: string;
};

export type CoordinatorImportResult = {
  masterRows: Record<string, string>[];
  errorRows: Array<{ sourceRow: number; reason: string; raw: Record<string, string> }>;
  previewRows: CoordinatorPreviewRow[];
  summary: { new: number; mergedSecondSquad: number; error: number };
};

const HEADER_ALIASES: Record<string, keyof Omit<CoordinatorRow, "sourceRow" | "raw" | "errors" | "generatedId">> = {
  "bowler id": "bowlerId",
  "phone": "phone", "cell": "phone", "mobile": "phone",
  "email": "email", "e-mail": "email",
  "squad time": "squadTime", "squad": "squadTime", "1st choice squad": "squadTime", "squad day & time": "squadTime",
  "lane #": "lane", "lane": "lane", "lane number": "lane",
  "center": "center", "house": "center", "bowling center": "center",
  "coordinator": "coordinator", "league secretary": "coordinator",
  "team #": "team", "team no": "team", "team number": "team", "team code": "team",
  "captain": "captain", "is captain": "captain",
  "first name": "firstName", "first": "firstName", "fname": "firstName",
  "last name": "lastName", "last": "lastName", "lname": "lastName",
  "under 21?": "under21", "u21": "under21", "minor": "under21",
  "sanction #": "sanctionNumber", "usbc #": "sanctionNumber", "usbc": "sanctionNumber", "member id": "sanctionNumber",
  "# games": "games", "games": "games",
  "best avg": "bestAverage", "high avg": "bestAverage", "average": "bestAverage",
  "team name": "teamName", "team": "teamName",
  "league member": "leagueMember",
  "t-shirt size": "shirtSize", "shirt size": "shirtSize", "size": "shirtSize",
  "hotel confirmation": "hotelConfirmation", "conf #": "hotelConfirmation", "confirmation": "hotelConfirmation",
  "check in": "checkIn", "arrival": "checkIn",
  "check out": "checkOut", "departure": "checkOut",
  "roommate first name": "roommateFirstName", "room with first": "roommateFirstName",
  "roommate last name": "roommateLastName", "room with last": "roommateLastName",
  "2nd choice squad": "secondSquadTime", "2nd squad time": "secondSquadTime",
  "2nd lane #": "secondLane",
  "position": "bowlerPosition", "pos": "bowlerPosition", "bowler position": "bowlerPosition", "bowler #": "bowlerPosition",
};

function normalizeHeader(header: string) {
  return header.replace(/\s+/g, " ").trim().toLowerCase();
}

function blankRow(sourceRow: number, raw: Record<string, string>): CoordinatorRow {
  return {
    sourceRow, raw, bowlerId: "", phone: "", email: "", squadTime: "", lane: "", center: "", coordinator: "", team: "", captain: "", firstName: "", lastName: "", under21: "", sanctionNumber: "", games: "", bestAverage: "", teamName: "", leagueMember: "", shirtSize: "", hotelConfirmation: "", checkIn: "", checkOut: "", roommateFirstName: "", roommateLastName: "", secondSquadTime: "", secondLane: "", bowlerPosition: "", errors: [], generatedId: "",
  };
}

export function normalizeCoordinatorRows(matrix: string[][]): CoordinatorRow[] {
  const headers = matrix[0] ?? [];
  return matrix.slice(1).filter((cells) => cells.some((cell) => String(cell ?? "").trim())).map((cells, dataIndex) => {
    const raw: Record<string, string> = {};
    const row = blankRow(dataIndex + 2, raw);
    headers.forEach((header, index) => {
      const displayHeader = String(header ?? "").trim();
      const value = String(cells[index] ?? "").trim();
      if (!displayHeader) return;
      raw[displayHeader] = value;
      const field = HEADER_ALIASES[normalizeHeader(displayHeader)];
      if (field) row[field] = value;
    });
    return row;
  });
}

function truthy(value: string) {
  return ["y", "yes", "1", "true"].includes(value.trim().toLowerCase());
}

function numeric(value: string) {
  return value.replace(/\D/g, "");
}

function twoDigits(value: string) {
  const digits = numeric(value);
  return digits.length >= 1 && digits.length <= 2 ? digits.padStart(2, "0") : "";
}

export function generateCoordinatorBowlerId(centerCode: string, leagueCode: string, eventCode: string, team: string, position: string) {
  const cc = twoDigits(centerCode);
  const ll = twoDigits(leagueCode);
  const ee = twoDigits(eventCode);
  const tt = twoDigits(team);
  const bb = twoDigits(position);
  return cc && ll && ee && tt && bb ? `${cc}${ll}${ee}${tt}${bb}` : "";
}

function centerCodeFor(center: string, centers: CenterCodeLookup[]) {
  const normalized = center.trim().toLowerCase();
  const match = centers.find((item) => item.centerName.trim().toLowerCase() === normalized);
  return match?.centerCode === null || match?.centerCode === undefined ? "" : String(match.centerCode);
}

function addRequiredErrors(row: CoordinatorRow, centerCode: string, leagueCode: string, eventCode: string) {
  if (!row.firstName) row.errors.push("Missing first name");
  if (!row.lastName) row.errors.push("Missing last name");
  if (!row.center) row.errors.push("Missing center");
  if (!centerCode) row.errors.push(`Missing center code${row.center ? ` for ${row.center}` : ""}`);
  if (!row.team) row.errors.push("Missing team number");
  if (!row.bowlerPosition) row.errors.push("Missing bowler position");
  if (!row.squadTime) row.errors.push("Missing primary squad time");
  if (!twoDigits(leagueCode)) row.errors.push("Missing or invalid league code");
  if (!twoDigits(eventCode)) row.errors.push("Missing or invalid event code");
  if (row.bowlerId && !/^\d{10}$/.test(row.bowlerId)) row.errors.push("Existing Bowler ID must contain exactly 10 digits");
}

function identityFor(row: CoordinatorRow) {
  if (row.generatedId) return `id:${row.generatedId}`;
  const sanction = numeric(row.sanctionNumber);
  if (sanction) return `sanction:${sanction}`;
  if (row.email) return `email:${row.email.trim().toLowerCase()}`;
  return `name:${row.firstName.trim().toLowerCase()}|${row.lastName.trim().toLowerCase()}`;
}

function squadSortValue(value: string) {
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return date;
  const compact = value.trim().toUpperCase().match(/^([MTWRFSU])(\d+)?$/);
  if (compact) {
    const dayOrder: Record<string, number> = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6, U: 7 };
    return dayOrder[compact[1]] * 100 + Number(compact[2] ?? 0);
  }
  return Number.MAX_SAFE_INTEGER;
}

function makeMasterRow(row: CoordinatorRow, secondary?: CoordinatorRow): Record<string, string> {
  const master: Record<string, string> = Object.fromEntries(MASTER_PASTE_HEADERS.map((header) => [header, ""]));
  master["Bowler ID"] = row.bowlerId || row.generatedId;
  master["Phone"] = row.phone;
  master["Email"] = row.email;
  master["Squad Day & Time"] = row.squadTime;
  master["Lane #"] = row.lane;
  master["Center"] = row.center;
  master["Coordinator"] = row.coordinator;
  master["Team #"] = row.team;
  master["Captain"] = truthy(row.captain) ? "Y" : row.captain;
  master["First Name"] = row.firstName;
  master["Last Name"] = row.lastName;
  master["Under 21?"] = row.under21;
  master["Sanction #"] = row.sanctionNumber;
  master["# Games"] = row.games;
  master["Best Avg"] = row.bestAverage;
  master["Team Name"] = row.teamName;
  master["League Member"] = row.leagueMember;
  master["T-Shirt Size"] = row.shirtSize;
  master["Hotel Confirmation"] = row.hotelConfirmation;
  master["Check In"] = row.checkIn;
  master["Check Out"] = row.checkOut;
  master["Roommate First Name"] = row.roommateFirstName;
  master["Roommate Last Name"] = row.roommateLastName;
  master["2nd Squad Time"] = secondary?.squadTime || row.secondSquadTime;
  master["2nd Lane #"] = secondary?.lane || row.secondLane;
  MASTER_PASTE_PROTECTED_HEADERS.forEach((header) => { master[header] = ""; });
  return master;
}

export function buildCoordinatorImport(matrix: string[][], centers: CenterCodeLookup[], leagueCode: string, eventCode: string): CoordinatorImportResult {
  const rows = normalizeCoordinatorRows(matrix);
  const errorRows: CoordinatorImportResult["errorRows"] = [];
  const validRows: CoordinatorRow[] = [];

  rows.forEach((row) => {
    const centerCode = centerCodeFor(row.center, centers);
    addRequiredErrors(row, centerCode, leagueCode, eventCode);
    row.generatedId = generateCoordinatorBowlerId(centerCode, leagueCode, eventCode, row.team, row.bowlerPosition);
    if (row.errors.length) errorRows.push({ sourceRow: row.sourceRow, reason: row.errors.join("; "), raw: row.raw });
    else validRows.push(row);
  });

  const grouped = new Map<string, CoordinatorRow[]>();
  validRows.forEach((row) => {
    const key = identityFor(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  const masterRows: Record<string, string>[] = [];
  const previewRows: CoordinatorPreviewRow[] = errorRows.map((error) => ({
    sourceRows: [error.sourceRow], status: "Error", bowlerId: "", firstName: error.raw["First Name"] ?? error.raw.First ?? "", lastName: error.raw["Last Name"] ?? error.raw.Last ?? "", center: error.raw.Center ?? error.raw["Bowling Center"] ?? "", team: error.raw["Team #"] ?? error.raw.Team ?? "", squadTime: error.raw["Squad Time"] ?? error.raw.Squad ?? "", reason: error.reason,
  }));
  let newCount = 0;
  let mergedSecondSquad = 0;

  grouped.forEach((group) => {
    const ordered = [...group].sort((a, b) => squadSortValue(a.squadTime) - squadSortValue(b.squadTime) || a.sourceRow - b.sourceRow);
    if (ordered.length > 2) {
      ordered.forEach((row) => {
        const reason = ">2 squads for the same bowler";
        errorRows.push({ sourceRow: row.sourceRow, reason, raw: row.raw });
        previewRows.push({ sourceRows: [row.sourceRow], status: "Error", bowlerId: row.bowlerId || row.generatedId, firstName: row.firstName, lastName: row.lastName, center: row.center, team: row.team, squadTime: row.squadTime, reason });
      });
      return;
    }
    const [primary, secondary] = ordered;
    const isMerge = Boolean(secondary);
    const isUpdate = Boolean(primary.bowlerId);
    masterRows.push(makeMasterRow(primary, secondary));
    if (isMerge) mergedSecondSquad += 1;
    else if (!isUpdate) newCount += 1;
    previewRows.push({
      sourceRows: ordered.map((row) => row.sourceRow),
      status: isMerge ? "Merge-2nd-squad" : isUpdate ? "Update" : "New",
      bowlerId: primary.bowlerId || primary.generatedId,
      firstName: primary.firstName,
      lastName: primary.lastName,
      center: primary.center,
      team: primary.team,
      squadTime: primary.squadTime,
      reason: isMerge ? `Secondary squad: ${secondary?.squadTime || "Not provided"}` : undefined,
    });
  });

  return { masterRows, errorRows, previewRows, summary: { new: newCount, mergedSecondSquad, error: errorRows.length } };
}
