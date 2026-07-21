import {
  int,
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

// ─── USERS (auth accounts for all roles) ────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── ED STAFF (username/password accounts for non-Manus ED access) ───────────
export const edStaff = mysqlTable("ed_staff", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"), // references users.id of the admin who created them
});

export type EdStaff = typeof edStaff.$inferSelect;
export type InsertEdStaff = typeof edStaff.$inferInsert;

// ─── EVENTS ─────────────────────────────────────────────────────────────────
// --- EVENT GROUPS (brands: BOB, Valentine Funtime, June Funtime Roll-Off)
export const eventGroups = mysqlTable("event_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  domain: varchar("domain", { length: 255 }),
  themeColor: varchar("themeColor", { length: 32 }).default("#ffd700"),
  logoUrl: text("logoUrl"),
  description: text("description"),
  isMultiEvent: boolean("isMultiEvent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EventGroup = typeof eventGroups.$inferSelect;

export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId"),
  /** Slug matching GROUP_THEMES key: 'bob' | 'valentine' | 'june-group-1' ... 'june-group-4' */
  groupSlug: varchar("groupSlug", { length: 64 }).default("bob"),
  /** For June groups: 1-4. Null for BOB and Valentine. */
  groupNumber: int("groupNumber"),
  eventName: varchar("eventName", { length: 255 }).notNull(),
  eventYear: int("eventYear").notNull(),
  startDate: varchar("startDate", { length: 20 }),
  endDate: varchar("endDate", { length: 20 }),
  bowlingDate: varchar("bowlingDate", { length: 20 }),
  squadTime: varchar("squadTime", { length: 50 }),
  status: mysqlEnum("status", ["planning", "active", "completed"]).default("planning").notNull(),
  tabletPin: varchar("tabletPin", { length: 6 }),
  sortOrder: int("sortOrder").default(0),
  // Banquet info — applies to ALL bowlers in this event
  banquetLocation: text("banquetLocation"),
  banquetTime: varchar("banquetTime", { length: 100 }),
  // ── Event Wizard fields (Section 1) ──────────────────────────────────────
  // Q1: Hotel check-in day & time
  hotelCheckinDay: varchar("hotelCheckinDay", { length: 50 }),
  hotelCheckinTime: varchar("hotelCheckinTime", { length: 50 }),
  // Q2: Bowling registration day & time
  registrationDay: varchar("registrationDay", { length: 50 }),
  registrationTime: varchar("registrationTime", { length: 50 }),
  // Q3: T-shirts provided?
  tshirtsProvided: boolean("tshirtsProvided").default(false),
  tshirtPickupLocation: text("tshirtPickupLocation"),
  tshirtPickupTime: varchar("tshirtPickupTime", { length: 100 }),
  // Q4: Pool party?
  poolPartyEnabled: boolean("poolPartyEnabled").default(false),
  poolPartyTime: varchar("poolPartyTime", { length: 50 }),
  // Q5: Banquet day (time already in banquetTime, location in banquetLocation)
  banquetDay: varchar("banquetDay", { length: 50 }),
  // Q6: Hotel check-out day & time
  hotelCheckoutDay: varchar("hotelCheckoutDay", { length: 50 }),
  hotelCheckoutTime: varchar("hotelCheckoutTime", { length: 50 }),
  // Q7: Post-event survey enabled?
  surveyEnabled: boolean("surveyEnabled").default(false),
  surveyOpen: boolean("surveyOpen").default(false),
  // Show the Orleans Hotel info card modal in portals
  showHotelInfoCard: boolean("showHotelInfoCard").default(true),
  // Heartbeat cron task uid for the checkout survey notification
  surveyNotifyTaskUid: varchar("surveyNotifyTaskUid", { length: 65 }),
  surveyNotifiedAt: bigint("surveyNotifiedAt", { mode: "number" }),
  // ── Google Sheet routing (per-event read/write target) ───────────────────
  // The spreadsheet file ID this event's import reads from and writes QR/IDs back to.
  sheetSpreadsheetId: varchar("sheetSpreadsheetId", { length: 255 }),
  // The tab/page name inside that spreadsheet for this event.
  sheetTabName: varchar("sheetTabName", { length: 255 }),
  // A human-readable nickname for the tab, shown alongside the actual tab name in the ED portal.
  sheetTabNickname: varchar("sheetTabNickname", { length: 255 }),
  // Timestamp (ms) of the last successful write-back to the configured Google Sheet tab.
  sheetLastSyncedAt: bigint("sheetLastSyncedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;

// ─── BOWLING CENTERS ─────────────────────────────────────────────────────────
export const bowlingCenters = mysqlTable("bowling_centers", {
  id: int("id").autoincrement().primaryKey(),
  centerCode: varchar("centerCode", { length: 2 }).notNull().unique(), // CC (01-99)
  centerName: varchar("centerName", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BowlingCenter = typeof bowlingCenters.$inferSelect;

// ─── LEAGUES ─────────────────────────────────────────────────────────────────
export const leagues = mysqlTable("leagues", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  centerId: int("centerId").notNull(),
  leagueCode: varchar("leagueCode", { length: 1 }).notNull(), // L (1-9)
  leagueName: varchar("leagueName", { length: 255 }).notNull(),
  programDirectorName: varchar("programDirectorName", { length: 255 }),
  dayOfWeek: varchar("dayOfWeek", { length: 20 }),
  squadTime: varchar("squadTime", { length: 50 }),
  eventCode: varchar("eventCode", { length: 2 }).default("01"), // EE
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type League = typeof leagues.$inferSelect;

// ─── TEAMS ───────────────────────────────────────────────────────────────────
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  leagueId: int("leagueId").notNull(),
  centerId: int("centerId").notNull(),
  eventId: int("eventId").notNull(),
  teamCode: varchar("teamCode", { length: 2 }).notNull(), // TT (01-99)
  teamName: varchar("teamName", { length: 255 }),
  captainBowlerId: int("captainBowlerId"),
  status: mysqlEnum("status", ["gray", "yellow", "green"]).default("gray").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;

// ─── BOWLERS ─────────────────────────────────────────────────────────────────
export const bowlers = mysqlTable("bowlers", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  leagueId: int("leagueId"),
  teamId: int("teamId"),
  centerId: int("centerId"),
  scantronId: varchar("scantronId", { length: 10 }).unique(), // 9-10 digit ID
  bowlerPosition: varchar("bowlerPosition", { length: 2 }), // BB (01-99)
  legalFirstName: varchar("legalFirstName", { length: 100 }).notNull(),
  legalLastName: varchar("legalLastName", { length: 100 }).notNull(),
  preferredName: varchar("preferredName", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  govIdNote: text("govIdNote"),
  photoUrl: text("photoUrl"),
  pinHash: varchar("pinHash", { length: 255 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  appUserId: int("appUserId"),
  isCapitain: boolean("isCapitain").default(false),
  contactLocked: boolean("contactLocked").default(false),
  usbcVerified: boolean("usbcVerified").default(false),
  notes: text("notes"),
  rawImportFields: json("rawImportFields"),
  registrationStatus: mysqlEnum("registrationStatus", [
    "pre_registered",
    "signed_up",
    "verified",
    "checked_in",
    "unmatched",
  ]).default("pre_registered").notNull(),
  captainVerified: boolean("captainVerified").default(false),
  // Bowling stats & event details (from import sheet)
  sanctionNumber: varchar("sanctionNumber", { length: 20 }),
  gamesPlayed: int("gamesPlayed"),
  bestAverage: int("bestAverage"),
  tshirtSize: varchar("tshirtSize", { length: 10 }),
  under21: boolean("under21").default(false),
  leagueMember: boolean("leagueMember").default(false),
  squadTime: varchar("squadTime", { length: 50 }),
  laneNumber: int("laneNumber"),
  // Lane-to-event info (column 44 in import sheet — e.g. "Lanes 1-4 → Banquet Hall A")
  laneToEvent: text("laneToEvent"),
  // Guest pool party add-ons: $15 per extra guest entry (column U in sheet)
  guestPoolPartyAmount: decimal("guestPoolPartyAmount", { precision: 10, scale: 2 }).default("0.00"),
  // Passport QR tokens (pool party + banquet dinner)
  poolPartyToken: varchar("poolPartyToken", { length: 64 }).unique(),
  poolPartyUsed: boolean("poolPartyUsed").default(false).notNull(),
  banquetToken: varchar("banquetToken", { length: 64 }).unique(),
  banquetUsed: boolean("banquetUsed").default(false).notNull(),
  // Banquet table assignment (e.g. "Choose a seat at Tables 1, 2, 3, or 4") — set by ED per bowler
  banquetTable: text("banquetTable"),
  // T-shirt distribution: set true when captain marks shirts received (Section 1 Q3)
  tshirtsReceived: boolean("tshirtsReceived").default(false),
  tshirtsReceivedAt: bigint("tshirtsReceivedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Bowler = typeof bowlers.$inferSelect;
export type InsertBowler = typeof bowlers.$inferInsert;

// ─── APP USERS (login accounts for all roles) ─────────────────────────────
export const appUsers = mysqlTable("app_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  designation: varchar("designation", { length: 10 }).notNull(), // DM1, ED, PD, TC, BW
  appRole: mysqlEnum("appRole", [
    "EventDirector",
    "ProgramDirector",
    "TeamCaptain",
    "Doorman",
    "Bowler",
  ]).notNull(),
  leagueId: int("leagueId"),
  teamId: int("teamId"),
  bowlerId: int("bowlerId"),
  eventId: int("eventId"),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = typeof appUsers.$inferInsert;

// ─── HOTEL RECORDS ───────────────────────────────────────────────────────────
export const hotelRecords = mysqlTable("hotel_records", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  hotelName: varchar("hotelName", { length: 255 }),
  reservationId: varchar("reservationId", { length: 100 }),
  confirmationCode: varchar("confirmationCode", { length: 100 }),
  checkinDate: varchar("checkinDate", { length: 20 }),
  checkoutDate: varchar("checkoutDate", { length: 20 }),
  roomType: varchar("roomType", { length: 20 }), // 1K, 2D, etc.
  roomAmount: decimal("roomAmount", { precision: 10, scale: 2 }),
  roommateRequested: boolean("roommateRequested").default(false),
  roommateFirstName: varchar("roommateFirstName", { length: 100 }),
  roommateLastName: varchar("roommateLastName", { length: 100 }),
  verified: boolean("verified").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HotelRecord = typeof hotelRecords.$inferSelect;

// ─── PAYMENT RECORDS ─────────────────────────────────────────────────────────
export const paymentRecords = mysqlTable("payment_records", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  roomAmount: decimal("roomAmount", { precision: 10, scale: 2 }),
  banquetAmount: decimal("banquetAmount", { precision: 10, scale: 2 }),
  poolParty: boolean("poolParty").default(false),
  extraGuestFee: decimal("extraGuestFee", { precision: 10, scale: 2 }),
  totalAmountDue: decimal("totalAmountDue", { precision: 10, scale: 2 }),
  paid: boolean("paid").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentRecord = typeof paymentRecords.$inferSelect;

// ─── LANE ASSIGNMENTS ────────────────────────────────────────────────────────
export const laneAssignments = mysqlTable("lane_assignments", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  teamId: int("teamId").notNull(),
  centerId: int("centerId").notNull(),
  bowlingDate: varchar("bowlingDate", { length: 20 }),
  laneNumber: int("laneNumber"),
  timeSlot: varchar("timeSlot", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LaneAssignment = typeof laneAssignments.$inferSelect;

// ─── ENTRY TOKENS (QR codes) ─────────────────────────────────────────────────
export const entryTokens = mysqlTable("entry_tokens", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  eventId: int("eventId").notNull(),
  tokenValue: varchar("tokenValue", { length: 128 }).notNull().unique(),
  tokenType: mysqlEnum("tokenType", ["initial", "reentry", "test"]).default("initial").notNull(),
  expiresAt: timestamp("expiresAt"),
  usedAt: timestamp("usedAt"),
  isUsed: boolean("isUsed").default(false).notNull(),
  generatedBy: int("generatedBy"),
  wristbandIssued: boolean("wristbandIssued").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EntryToken = typeof entryTokens.$inferSelect;

// ─── CHECK-INS ───────────────────────────────────────────────────────────────
export const checkIns = mysqlTable("check_ins", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  eventId: int("eventId").notNull(),
  checkinTime: timestamp("checkinTime").defaultNow().notNull(),
  method: mysqlEnum("method", ["QR", "PIN", "manual"]).notNull(),
  doormanId: int("doormanId"),
  tokenId: int("tokenId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CheckIn = typeof checkIns.$inferSelect;

// ─── WRISTBANDS ──────────────────────────────────────────────────────────────
export const wristbands = mysqlTable("wristbands", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  eventId: int("eventId").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  issuedByDoormanId: int("issuedByDoormanId"),
  reentryTokenId: int("reentryTokenId"),
  status: mysqlEnum("status", ["active", "denied", "flagged"]).default("active").notNull(),
  denialReason: text("denialReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Wristband = typeof wristbands.$inferSelect;

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId"),
  actorRole: varchar("actorRole", { length: 50 }),
  actorId: int("actorId"),
  action: varchar("action", { length: 100 }).notNull(),
  targetId: int("targetId"),
  targetType: varchar("targetType", { length: 50 }),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 50 }),
  deviceId: varchar("deviceId", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;

// ─── GIFTS ───────────────────────────────────────────────────────────────────
export const gifts = mysqlTable("gifts", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  giftName: varchar("giftName", { length: 255 }).notNull(),
  description: text("description"),
  stock: int("stock").default(0),
  eligibilityCriteria: text("eligibilityCriteria"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Gift = typeof gifts.$inferSelect;

// ─── REDEMPTIONS ─────────────────────────────────────────────────────────────
export const redemptions = mysqlTable("redemptions", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  giftId: int("giftId").notNull(),
  redeemedAt: timestamp("redeemedAt").defaultNow().notNull(),
  redeemedBy: int("redeemedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Redemption = typeof redemptions.$inferSelect;

// ─── IMPORT SESSIONS (track import history) ──────────────────────────────────
export const importSessions = mysqlTable("import_sessions", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId"),
  importedBy: int("importedBy"),
  sourceType: mysqlEnum("sourceType", ["csv", "paste", "google_sheets"]).notNull(),
  sourceName: varchar("sourceName", { length: 500 }),
  totalRows: int("totalRows").default(0),
  importedRows: int("importedRows").default(0),
  updatedRows: int("updatedRows").default(0),
  skippedRows: int("skippedRows").default(0),
  errorRows: int("errorRows").default(0),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending"),
  errorDetails: json("errorDetails"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ImportSession = typeof importSessions.$inferSelect;

// ─── OFFLINE SYNC QUEUE (redemptions queued while offline, replayed to cloud) ────────────────────────────────────────────────────────────────
export const offlineSyncQueue = mysqlTable("offline_sync_queue", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 255 }).notNull(),
  passportType: varchar("passport_type", { length: 20 }).notNull(), // 'pool' | 'banquet' | 'bowling'
  bowlerId: int("bowler_id"),
  scannedAt: int("scanned_at").notNull(),
  deviceId: varchar("device_id", { length: 100 }),
  syncedToCloud: int("synced_to_cloud").default(0),
  syncedAt: int("synced_at"),
  createdAt: int("created_at").notNull(),
});

export type OfflineSyncQueue = typeof offlineSyncQueue.$inferSelect;

// ─── GUEST POOL PARTY TOKENS (extra QR codes for paid guests) ────────────────
// Each $15 in column U generates one token: suffix A = first guest, B = second, etc.
export const guestPoolPartyTokens = mysqlTable("guest_pool_party_tokens", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  guestId: varchar("guestId", { length: 16 }), // scantronId + suffix (e.g. 1234567890A)
  eventId: int("eventId"),
  suffix: varchar("suffix", { length: 2 }).notNull(), // A, B, C, ...
  token: varchar("token", { length: 64 }).notNull().unique(), // pool party token
  used: boolean("used").default(false).notNull(),
  usedAt: bigint("usedAt", { mode: "number" }),
  banquetToken: varchar("banquetToken", { length: 255 }), // guest banquet token (when extra banquet purchased)
  banquetUsed: boolean("banquetUsed").default(false).notNull(),
  banquetUsedAt: bigint("banquetUsedAt", { mode: "number" }),
  disabled: boolean("disabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuestPoolPartyToken = typeof guestPoolPartyTokens.$inferSelect;

// ─── CONTACT REQUESTS (bowler submits phone/email → ED confirms → writes to Google Sheet) ──
export const contactRequests = mysqlTable("contact_requests", {
  id: int("id").autoincrement().primaryKey(),
  bowlerId: int("bowlerId").notNull(),
  eventId: int("eventId").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "rejected"]).default("pending").notNull(),
  sheetRow: int("sheetRow"),
  spreadsheetId: varchar("spreadsheetId", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
  confirmedAt: bigint("confirmedAt", { mode: "number" }),
});

export type ContactRequest = typeof contactRequests.$inferSelect;

// ─── SUPPORT MESSAGES (bowler login-help form → ED inbox) ────────────────────
export const supportMessages = mysqlTable("support_messages", {
  id: int("id").autoincrement().primaryKey(),
  bowlerName: varchar("bowlerName", { length: 255 }).notNull(),
  bowlerCenter: varchar("bowlerCenter", { length: 255 }).notNull(),
  contactInfo: varchar("contactInfo", { length: 255 }).notNull(), // phone or email provided by bowler
  message: text("message").notNull(),
  errorMsg: text("errorMsg"),
  status: mysqlEnum("status", ["new", "read", "replied"]).default("new").notNull(),
  edReply: text("edReply"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
  repliedAt: bigint("repliedAt", { mode: "number" }),
});
export type SupportMessage = typeof supportMessages.$inferSelect;

// ─── REENTRY TOKENS (doorman-generated, bracelet-secured single-use codes) ────
// Issued by a doorman when a bowler/guest exits and wants to re-enter. The
// original passport is already consumed, so a fresh single-use code is minted.
// A physical numbered bracelet is handed out; its number is stored here and
// shown back to the doorman on re-entry scan as a second identity factor.
export const reentryTokens = mysqlTable("reentry_tokens", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  bowlerId: int("bowlerId").notNull(),
  // Set when the re-entry is for a guest of this bowler (e.g. scantronId 1234567890A)
  guestId: varchar("guestId", { length: 12 }),
  // Which passport this re-entry corresponds to
  passportType: mysqlEnum("passportType", ["pool", "banquet"]).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  // Physical bracelet number written on the wristband handed to the patron
  braceletNumber: varchar("braceletNumber", { length: 20 }).notNull(),
  issuedByDoormanId: int("issuedByDoormanId"),
  issuedAt: bigint("issuedAt", { mode: "number" }).notNull(),
  used: boolean("used").default(false).notNull(),
  usedAt: bigint("usedAt", { mode: "number" }),
  scannedByDoormanId: int("scannedByDoormanId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReentryToken = typeof reentryTokens.$inferSelect;
export type InsertReentryToken = typeof reentryTokens.$inferInsert;

// ─── GUEST BOWLERS (guests linked to a primary bowler) ───────────────────────
// Identified at import: guest id = primary scantronId + suffix letter (A,B,C…).
// Each guest gets a pool party token and a banquet token generated at import.
export const guestBowlers = mysqlTable("guest_bowlers", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  bowlerId: int("bowlerId").notNull(),         // FK to primary bowler
  guestId: varchar("guestId", { length: 12 }).notNull().unique(), // e.g. 1234567890A
  suffix: varchar("suffix", { length: 2 }).notNull(),             // A, B, C…
  guestName: varchar("guestName", { length: 200 }),
  // Pool party pass
  poolToken: varchar("poolToken", { length: 64 }).unique(),
  poolUsed: boolean("poolUsed").default(false).notNull(),
  poolUsedAt: bigint("poolUsedAt", { mode: "number" }),
  // Banquet pass
  banquetToken: varchar("banquetToken", { length: 64 }).unique(),
  banquetUsed: boolean("banquetUsed").default(false).notNull(),
  banquetUsedAt: bigint("banquetUsedAt", { mode: "number" }),
  disabled: boolean("disabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuestBowler = typeof guestBowlers.$inferSelect;
export type InsertGuestBowler = typeof guestBowlers.$inferInsert;

// ─── ADVERTISEMENTS (sponsor ads shown in bowler & captain portals) ──────────
// Tiered weighted rotation: Bronze ×1, Silver ×2, Gold ×4 visibility weight.
export const advertisements = mysqlTable("advertisements", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  sponsorName: varchar("sponsorName", { length: 255 }).notNull(),
  tier: mysqlEnum("tier", ["bronze", "silver", "gold"]).default("bronze").notNull(),
  // Category for advertiser vetting (bowling, travel, shows, food)
  category: mysqlEnum("category", ["bowling", "travel", "shows", "food", "other"]).default("other").notNull(),
  mediaType: mysqlEnum("mediaType", ["image", "video"]).default("image").notNull(),
  mediaUrl: text("mediaUrl").notNull(),       // /manus-storage/... key url
  mediaKey: varchar("mediaKey", { length: 255 }), // storage key for reference
  linkUrl: text("linkUrl"),                   // optional advertiser hyperlink
  runUntil: bigint("runUntil", { mode: "number" }), // expiry timestamp (ms)
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Advertisement = typeof advertisements.$inferSelect;
export type InsertAdvertisement = typeof advertisements.$inferInsert;

// ─── SURVEY RESPONSES (post-event bowler feedback) ───────────────────────────
// Append-only. One response per (bowlerId, eventId). 1-5 star ratings + comments.
export const surveyResponses = mysqlTable("survey_responses", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  bowlerId: int("bowlerId").notNull(),
  submittedAt: bigint("submittedAt", { mode: "number" }).notNull(),
  // Q1 Overall experience, Q2 Bowling venue, Q3 Event organization,
  // Q4 Pool party (nullable), Q5 Banquet, Q6 This app, Q7 Likelihood of using similar app for league
  q1Rating: int("q1Rating"),
  q1Comment: text("q1Comment"),
  q2Rating: int("q2Rating"),
  q2Comment: text("q2Comment"),
  q3Rating: int("q3Rating"),
  q3Comment: text("q3Comment"),
  q4Rating: int("q4Rating"),
  q4Comment: text("q4Comment"),
  q5Rating: int("q5Rating"),
  q5Comment: text("q5Comment"),
  q6Rating: int("q6Rating"),
  q6Comment: text("q6Comment"),
  q7Rating: int("q7Rating"),
  q7Comment: text("q7Comment"),
  // Q8 open comments / grievances (no rating)
  q8Comment: text("q8Comment"),
  // Q9 testimonial permission
  testimonialPermission: boolean("testimonialPermission").default(false).notNull(),
  // Future attendance / next-season league intent
  attendNextYear: varchar("attendNextYear", { length: 16 }),
  attendNextYearComment: text("attendNextYearComment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type InsertSurveyResponse = typeof surveyResponses.$inferInsert;

// ─── DOOR SCAN LOG (offline-first scanner: persisted scans, overrides, ED flags) ──
// Every scan made on the offline single-laptop door system is recorded client-side
// in IndexedDB first, then synced here (idempotently) the moment connectivity returns.
// One row per scan attempt. Key for idempotency: (token, scannedAtMs).
export const doorScanLog = mysqlTable("door_scan_log", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId"),
  // 'banquet' | 'pool' — which door mode produced this scan
  mode: varchar("mode", { length: 16 }),
  token: varchar("token", { length: 128 }),
  // admitted | denied_used | denied_notfound | override_admitted | reentry_admitted | denied_wrongzone
  result: varchar("result", { length: 32 }),
  reason: text("reason"),
  lane: int("lane"),
  // Epoch ms when the scan happened on the device (source of truth for ordering + idempotency)
  scannedAtMs: bigint("scannedAtMs", { mode: "number" }),
  // Label/identity of the PIN holder who authorized an override (nullable)
  overrideBy: varchar("overrideBy", { length: 100 }),
  // Wristband number captured during reentry (nullable)
  wristbandNumber: varchar("wristbandNumber", { length: 40 }),
  // Flagged for Event Director review (suspicious / contested)
  edFlagged: boolean("edFlagged").default(false).notNull(),
  edReviewedAt: bigint("edReviewedAt", { mode: "number" }),
  // Device that produced the scan (for multi-device future-proofing)
  deviceId: varchar("deviceId", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DoorScanLog = typeof doorScanLog.$inferSelect;
export type InsertDoorScanLog = typeof doorScanLog.$inferInsert;

// ─── REENTRY CODES (reusable directional re-entry pool: N/E/S/W × 50 per mode) ──
// Pre-generated generic, reusable QR codes. Door-locked: a code is only valid at the
// zone that issued it. The doorman types the guest's wristband number when issuing,
// linking the reusable code to that wristband until released.
export const reentryCodes = mysqlTable("reentry_codes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  // 'banquet' | 'pool'
  mode: varchar("mode", { length: 16 }).notNull(),
  // 'N' | 'E' | 'S' | 'W'
  zone: varchar("zone", { length: 2 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  inUse: boolean("inUse").default(false).notNull(),
  linkedWristband: varchar("linkedWristband", { length: 40 }),
  issuedAtMs: bigint("issuedAtMs", { mode: "number" }),
  releasedAtMs: bigint("releasedAtMs", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReentryCode = typeof reentryCodes.$inferSelect;
export type InsertReentryCode = typeof reentryCodes.$inferInsert;

// ─── BOWLER CLAIM CODES (fall-season sign-up security) ───────────────────────
// One unique, one-time code per bowler, distributed on league night. A new
// sign-up must present the code (typed or scanned QR); it unlocks only that
// bowler's roster row. Existing accounts are unaffected.
export const bowlerClaimCodes = mysqlTable("bowler_claim_codes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  bowlerId: int("bowlerId").notNull(),
  // Human-friendly, no ambiguous chars (no 0/O/1/I), e.g. BOB-7F3K
  code: varchar("code", { length: 20 }).notNull().unique(),
  status: mysqlEnum("status", ["unused", "redeemed", "void"]).default("unused").notNull(),
  redeemedByAppUserId: int("redeemedByAppUserId"),
  redeemedAt: bigint("redeemedAt", { mode: "number" }),
  // Links a reissued code to the one it replaced (audit trail for lost codes)
  reissuedFromId: int("reissuedFromId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
});

export type BowlerClaimCode = typeof bowlerClaimCodes.$inferSelect;
export type InsertBowlerClaimCode = typeof bowlerClaimCodes.$inferInsert;

// ─── AD INQUIRIES ("Advertise Here" leads → ED Advertiser Leads inbox) ────────
// Submitted when someone taps the "Advertise Here" placeholder in a portal ad
// slot. Kept separate from bowler login-help (support_messages).
export const adInquiries = mysqlTable("ad_inquiries", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId"),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  contact: varchar("contact", { length: 255 }).notNull(), // email or phone
  message: text("message").notNull(),
  slotLabel: varchar("slotLabel", { length: 50 }), // which slot the lead came from
  status: mysqlEnum("status", ["new", "read", "archived"]).default("new").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
});

export type AdInquiry = typeof adInquiries.$inferSelect;
export type InsertAdInquiry = typeof adInquiries.$inferInsert;
