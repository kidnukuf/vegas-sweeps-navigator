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
  eventName: varchar("eventName", { length: 255 }).notNull(),
  eventYear: int("eventYear").notNull(),
  startDate: varchar("startDate", { length: 20 }),
  endDate: varchar("endDate", { length: 20 }),
  bowlingDate: varchar("bowlingDate", { length: 20 }),
  squadTime: varchar("squadTime", { length: 50 }),
  status: mysqlEnum("status", ["planning", "active", "completed"]).default("planning").notNull(),
  tabletPin: varchar("tabletPin", { length: 6 }),
  sortOrder: int("sortOrder").default(0),
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
  suffix: varchar("suffix", { length: 2 }).notNull(), // A, B, C, ...
  token: varchar("token", { length: 64 }).notNull().unique(),
  used: boolean("used").default(false).notNull(),
  disabled: boolean("disabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuestPoolPartyToken = typeof guestPoolPartyTokens.$inferSelect;
