export type CoordinatorRosterField =
  | "firstName" | "lastName" | "center" | "leagueSession" | "teamNumber" | "teamName" | "captain"
  | "email" | "phone" | "notes" | "lane" | "under21" | "sanctionNumber" | "games" | "bestAverage"
  | "shirtSize" | "hotelConfirmation" | "hotelCheckIn" | "hotelCheckOut" | "roomType" | "roommateName"
  | "specialRequestCategory" | "specialRequestNote" | "specialRequestStatus";

export const COORDINATOR_ROSTER_FIELD_ALIASES: Record<string, CoordinatorRosterField> = {
  firstname: "firstName", "first name": "firstName", legalfirstname: "firstName", "legal first name": "firstName", first: "firstName", fname: "firstName",
  lastname: "lastName", "last name": "lastName", legallastname: "lastName", "legal last name": "lastName", last: "lastName", lname: "lastName",
  center: "center", centername: "center", "center name": "center", house: "center", "bowling center": "center",
  leaguesession: "leagueSession", "league session": "leagueSession", leaguedaytime: "leagueSession", "league day time": "leagueSession", league: "leagueSession", "league time": "leagueSession", "squad day time": "leagueSession", "squad day & time": "leagueSession", "squad time": "leagueSession",
  teamnumber: "teamNumber", "team number": "teamNumber", "team #": "teamNumber", "team no": "teamNumber", "team code": "teamNumber",
  teamname: "teamName", "team name": "teamName", team: "teamName",
  captain: "captain", iscaptain: "captain", "is captain": "captain", "team captain": "captain",
  email: "email", "e-mail": "email", emailaddress: "email", "email address": "email",
  phone: "phone", phonenumber: "phone", "phone number": "phone", cell: "phone", mobile: "phone", "mobile phone": "phone",
  notes: "notes", note: "notes", initialrequest: "notes", "initial request": "notes", comments: "notes",
  lane: "lane", "lane #": "lane", "lane number": "lane",
  under21: "under21", "under 21": "under21", "under 21?": "under21", u21: "under21", minor: "under21",
  sanctionnumber: "sanctionNumber", "sanction number": "sanctionNumber", "sanction #": "sanctionNumber", usbc: "sanctionNumber", "usbc #": "sanctionNumber", "member id": "sanctionNumber",
  games: "games", "# games": "games", "number of games": "games",
  bestaverage: "bestAverage", "best average": "bestAverage", "best avg": "bestAverage", average: "bestAverage", "high avg": "bestAverage",
  shirtsize: "shirtSize", "shirt size": "shirtSize", "t-shirt size": "shirtSize", "tshirt size": "shirtSize", size: "shirtSize",
  hotelconfirmation: "hotelConfirmation", "hotel confirmation": "hotelConfirmation", confirmation: "hotelConfirmation", "conf #": "hotelConfirmation",
  hotelcheckin: "hotelCheckIn", "hotel check in": "hotelCheckIn", "check in": "hotelCheckIn", arrival: "hotelCheckIn",
  hotelcheckout: "hotelCheckOut", "hotel check out": "hotelCheckOut", "check out": "hotelCheckOut", departure: "hotelCheckOut",
  roomtype: "roomType", "room type": "roomType", roommatename: "roommateName", "roommate name": "roommateName",
  specialrequestcategory: "specialRequestCategory", "special request category": "specialRequestCategory",
  specialrequestnote: "specialRequestNote", "special request note": "specialRequestNote", request: "specialRequestNote",
  specialrequeststatus: "specialRequestStatus", "special request status": "specialRequestStatus",
};

export const APP_CONTROLLED_IMPORT_HEADERS = new Set([
  "bowler id", "claim code", "pool qr", "pool used", "banquet qr", "banquet used", "bill breakdown", "team score",
  "event ranking", "payout amount", "guest name", "additional guest",
]);

export function normalizeCoordinatorHeader(header: unknown) {
  return String(header ?? "").trim().replace(/[_.-]/g, " ").replace(/\s+/g, " ").toLowerCase();
}

export function coordinatorFieldForHeader(header: unknown): CoordinatorRosterField | undefined {
  const normalized = normalizeCoordinatorHeader(header);
  return COORDINATOR_ROSTER_FIELD_ALIASES[normalized] ?? COORDINATOR_ROSTER_FIELD_ALIASES[normalized.replace(/\s/g, "")];
}

export type MappedCoordinatorSource = {
  rows: Record<string, string>[];
  recognizedHeaders: string[];
  ignoredHeaders: string[];
  appControlledHeaders: string[];
  sourceRowCount: number;
};

/** Maps recognizable coordinator-owned source columns and intentionally excludes app-controlled columns. */
export function mapCoordinatorSourceMatrix(matrix: string[][]): MappedCoordinatorSource {
  const headers = (matrix[0] ?? []).map((header) => String(header ?? "").trim());
  const mappings = headers.map((header) => coordinatorFieldForHeader(header));
  const recognizedHeaders = headers.filter((header, index) => Boolean(mappings[index]));
  const appControlledHeaders = headers.filter((header, index) => !mappings[index] && APP_CONTROLLED_IMPORT_HEADERS.has(normalizeCoordinatorHeader(header)));
  const ignoredHeaders = headers.filter((header, index) => header && !mappings[index] && !APP_CONTROLLED_IMPORT_HEADERS.has(normalizeCoordinatorHeader(header)));
  const rows = matrix.slice(1).filter((cells) => cells.some((cell) => String(cell ?? "").trim())).map((cells) => {
    const row: Record<string, string> = {};
    mappings.forEach((field, index) => {
      if (field && row[field] === undefined) row[field] = String(cells[index] ?? "").trim();
    });
    return row;
  });
  return { rows, recognizedHeaders, ignoredHeaders, appControlledHeaders, sourceRowCount: rows.length };
}

export function sourceMatrixToCsv(matrix: string[][]) {
  const quote = (cell: unknown) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  return matrix.map((row) => row.map(quote).join(",")).join("\r\n");
}
