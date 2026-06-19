# Vegas Sweeps Funtime — Master Build TODO (Blueprint v1.2)

## Phase 1A — Complete Database Schema (14 Tables)
- [x] Rewrite Drizzle schema: events, bowling_centers, leagues, teams, bowlers (full fields)
- [x] Drizzle schema: hotel_records, lane_assignments, entry_tokens, check_ins
- [x] Drizzle schema: wristbands, app_users, audit_log, gifts, redemptions, payment_records
- [x] Generate migration SQL and apply
- [x] Seed 14 bowling centers, event record, league record

## Phase 1B — CSV / Google Sheets Import System (Admin Only)
- [x] Install papaparse
- [x] Build import tRPC router: parse, validate, dedup, generate IDs, atomic DB write
- [x] Build column auto-detection + manual mapping UI
- [x] Build row validation with inline correction
- [x] Build duplicate detection (update / skip / new)
- [x] Build 10-digit ID pre-generation during import (CC+L+EE+TT+BB)
- [x] Build import UI panel inside admin dashboard (CSV upload, paste, Google Sheets URL)
- [x] Build import summary report
- [x] Build export-to-CSV feature (full roster, per-center, check-in status, audit log)

## Phase 2 — Authentication System
- [x] Build combined Sign-In / Sign-Up landing page (neon theme, fully responsive)
- [x] Bowler sign-up: priority-order matching (phone → email → name) against pre-registered records
- [x] Team Captain checkbox routing
- [x] Doorman login page (/doorman-login, separate URL, ED-created accounts)
- [x] Event Director login (admin credentials)
- [x] JWT sessions for all 5 roles with role-based route protection
- [x] Unmatched sign-up queue (pending verification state)

## Phase 3 — Backend tRPC Routers (All Features)
- [x] bowlers router: list, get, update, search, match, unmatched queue
- [x] teams router: list, get, update, status (gray/yellow/green)
- [x] checkin router: scan, validate token, atomic confirm, audit write
- [x] tokens router: generate QR token, invalidate, test (0000000000)
- [x] wristbands router: issue (one-time), reentry scan, deny/flag
- [x] doorman router: create DM account, list, reset password
- [x] import router: parse CSV/paste, fetch Google Sheets, validate, write, export
- [x] SSE endpoint: real-time broadcast to all doorman tablets on token invalidation

## Phase 4 — Event Director Dashboard
- [x] Hierarchical layout: Event → Center → Team → Bowler (collapsible)
- [x] Search bar: name, 10-digit ID, center, team, phone
- [x] Stats bar: Total / Pre-Registered / Signed Up / Verified / Checked In / Unmatched
- [x] Team color-coding: gray (incomplete) → yellow (all registered) → green (captain verified)
- [x] Full bowler record editor (all fields, no restrictions, all edits logged)
- [x] Doorman account management panel (create DM1–DM99, set password, view active)
- [x] QR Test System: generate test QR (0000000000), 3-mode test, pass/fail report
- [x] Import Data panel (CSV / Sheets / Paste) with progress indicator
- [x] Unmatched sign-ups queue with manual link tool

## Phase 5 — QR Code System + Doorman Check-In Screen
- [x] Server-side cryptographic QR token generation (single-use, event-scoped)
- [x] QR code display on bowler profile page (self-display)
- [x] Doorman check-in screen: camera scan (html5-qrcode) + Bluetooth HID input
- [x] Atomic token invalidation: DB transaction → mark used → write check_in → write audit_log
- [x] SSE broadcast to all connected doorman tablets on every invalidation
- [x] Bowler card display after successful scan (name, photo, seat/table)
- [x] DENIED screen (red flash) for invalid/used tokens
- [x] Wristband issuance flow: one-time only, mandatory doorman prompt
- [x] Reentry scan flow: validate wristband QR, check condition
- [x] Denial flow: "Wristband Compromised" button → audit log
- [x] Persistent doorman reminder panel (verify ID, check wristband, explain policy)

## Phase 6 — Team Captain + Bowler + Program Director Pages
- [x] Team Captain page: ⭐ header, roster table, completion ring, responsibility cards
- [x] Captain approval flow: Verify button per bowler, Yellow→Green status update
- [x] Shareable registration link generator (team pre-filled)
- [x] Bowler profile page: itinerary, self-display QR, hotel/lane/schedule, gift status
- [x] Ad banner slots on bowler and captain pages (static sponsor image slots)
- [x] Program Director: league-scoped roster, team completion status, read-only

## Phase 7 — PWA + Offline + Theme Polish + Tests
- [x] Update service worker to cache all routes and assets
- [x] IndexedDB for offline data caching (bowler records, team data)
- [x] Offline mode detection: 2-second ping to local hub, graceful fallback
- [x] Offline banner: "OFFLINE — QR DISABLED. Use PIN fallback."
- [x] PWA manifest icons (192px and 512px)
- [x] Final neon theme polish: all pages consistent (dark bg, gold/cyan, glow)
- [x] Full vitest test suite (ID generation, import pipeline, token invalidation, auth, RBAC)
- [x] Final checkpoint and deliver

## Phase 8: Bowler & Captain Sign-Up / Sign-In System

- [x] Add bowler_accounts table to schema (bowlerId FK, passwordHash, email, createdAt)
- [x] Add captain_accounts table (bowlerId FK, teamId FK, passwordHash, email, createdAt)
- [x] tRPC: bowlerAuth.signUp — verify name against bowlers table, hash password, create account
- [x] tRPC: bowlerAuth.signIn — verify credentials, return JWT
- [x] tRPC: bowlerAuth.me — return bowler + hotel + payment + team + lane data
- [x] tRPC: captainAuth.signUp — verify name + captain status, hash password, create account
- [x] tRPC: captainAuth.signIn — verify credentials, return JWT
- [x] tRPC: captainAuth.me — return captain + full team roster + completion stats
- [x] Bowler Portal page (/bowler-login): consumer-style warm design, sign-up/sign-in tabs
- [x] Bowler Dashboard (/bowler): personal profile card, QR ticket, team info, event details, hotel/payment status
- [x] Team Captain Portal page (/captain-login): bold team-management design, sign-up/sign-in tabs
- [x] Captain Dashboard (/captain): team roster with verify buttons, completion ring, stats, shareable link
- [x] Event Director login gate: protect /admin with its own PIN/password login page
- [x] Update Home.tsx with distinct entry cards for Bowler, Captain, and Event Director
- [x] Run tests and save checkpoint

## Phase 9: Cloudflare Turnstile + Admin Sign-Up Visibility

- [x] Add Cloudflare Turnstile widget to Bowler Login sign-in and sign-up forms
- [x] Add Cloudflare Turnstile widget to Captain Login sign-in and sign-up forms
- [x] Add server-side Turnstile token verification in bowlerAuth signIn and signUp procedures
- [x] Add green highlight/badge to Admin Dashboard roster rows for bowlers who have signed up (passwordHash set)
- [x] Add "Signed Up" filter/column to Admin Dashboard so ED can see all registered bowlers and captains at a glance

## Phase 10: Fix Import Crash & Full Column Mapping

- [x] Fix import crash: client referenced importResult.ids but server returns generatedIds
- [x] Send raw rows (original headers) to server so its header-based lookups work
- [x] Keep raw row data in ParsedRow for each parsed bowler
- [x] Add column aliases for Squad Time, Lane #, Gender, Under 21, Sanction #, etc. (preview display)
- [x] Test import end-to-end with the real xlsx-derived CSV

## Phase 11: Import Verify + Multi-Event + Bowler Delete (Jun 17)

- [x] Fix center-name aliases (Bowlero River Grove Sat -> Saturday) and exact-match center lookup
- [x] Fix legacy NOT NULL columns (legalName, phone) blocking bowler inserts
- [x] Verify full roster (452 rows) imports with 0 center-not-found errors (450 updated, 0 errors)
- [x] Multi-event: create new event button + rename event (Event Director)
- [x] Multi-event: all data (bowlers/teams/imports) scoped per event, manageable simultaneously
- [x] Active event title displayed at top of Event Director section
- [x] Event switcher to change which event is active
- [x] Per-event scoped export: only the selected event's data is exported (client-side CSV download; queries eventId-scoped, filenames event-slugged)
- [x] Import scoped to the selected/active event (ImportData reads the same selected-event as the dashboard, no longer hardcoded to event 1)
- [x] Delete bowler button (Event Director) with PERMANENT-deletion warning + confirm verification step (type DELETE, audit-logged before removal)

## Phase 12: Rename + Import Overhaul (Jun 17)

- [x] Rename app to "B.O.B. Roll-off Passport" in all UI text, page titles, manifest, service worker, and metadata (B.O.B. = Bowlers Orleans Bound)
- [x] Update import parser column aliases to match new 24-column sheet layout
- [x] Map hotel fields (Check In, Check Out, Room Type, Roommate First Name, Roommate Last Name) from import into hotel_records table
- [x] Map add-on fields (Guest $15, extra banquet, extra pool party) into payment_records
- [x] Ensure Phone and Email columns are accepted but treated as optional/empty without errors
- [x] Test import end-to-end with the new 22-column bob_roster.csv (452 rows, 0 errors expected)

## Phase 13: Center-Verified Bowler Sign-Up + Header Rename (Jun 17)

- [x] Add tRPC procedure listCenters to bowlerAuth router — returns distinct center names for the active event
- [x] Update bowlerAuth.signUp to require centerId and verify first name + last name + center all match a roster record
- [x] Add center selection popup (Dialog) to BowlerLogin sign-up form (populated from DB, searchable)
- [x] Add center selection popup (Dialog) to CaptainLogin sign-up form (populated from DB, searchable)
- [x] Update all portal headers (Bowler, Captain, Doorman, Event Director) to show "B.O.B. Roll-off Passport"

## Phase 14: QR Passport System + Post-Sign-Up Confirmation Flow (Jun 18)

### Database
- [x] Add poolPartyToken (varchar, nullable), poolPartyUsed (boolean), banquetToken (varchar, nullable), banquetUsed (boolean) to bowlers table
- [x] Run migration SQL via webdev_execute_sql

### Server
- [x] Generate two unique UUID tokens at bowler sign-up (pool + banquet), store in DB
- [x] tRPC: bowlerAuth.submitContactInfo — save phone + email, return full profile with tokens
- [x] tRPC: bowlerAuth.scanPassport — validate token (type: pool|banquet), check not null, check not used, mark used, return result + bowler name
- [x] tRPC: bowlerAuth.disablePassport / enablePassport — Event Director only
- [x] tRPC: bowlerAuth.getPassportStatus — list all bowlers with token/used status for Event Director
- [ ] Google Sheet write-back: HYPERLINK formula for pool and banquet QR URLs written after sign-up (deferred — requires Google Service Account setup)

### Bowler Post-Sign-Up Confirmation Page (/bowler-confirmation)
- [x] Step 1: 10-digit zero-padded bowler ID prominently displayed, phone + email entry fields, submit
- [x] Step 2: Full-screen color burst animated splash with "Bowlers Orleans Bound" overlay text
- [x] Step 3: Event week dates, squad number, starting lane
- [x] Pool Party Passport box — QR code if token active, "See your Team Captain" if disabled/null
- [x] Banquet Dinner Passport box — same logic
- [x] Early arrival prompt: "We recommend arriving 30 minutes early — lines form quickly!"

### Captain Post-Sign-Up Confirmation Page (/captain-confirmation)
- [x] Same as bowler confirmation (ID, phone/email, color burst, event details, passport QR boxes)
- [x] After contact info: team verification page showing all teammates with sign-up status
- [x] Captain responsibility popup: "You are the primary contact for your team. All event interactions go through you to the Event Director."
- [x] Early arrival prompt same as bowler

### Doorman Portal (rebuild /doorman)
- [x] Camera QR scanner using html5-qrcode
- [x] Mode selector: Pool Party | Banquet Dinner
- [x] On valid scan: green "Entry Granted" screen with bowler name
- [x] On already used: red "Already Redeemed" screen
- [x] On disabled/null: red "Not Eligible — See Event Director" screen
- [x] On invalid token: red "Invalid QR Code" screen

### Event Director — Passport Management Tab
- [x] New tab in Event Director dashboard: Passport Management
- [x] Table: all bowlers, pool party token status (active/disabled/redeemed), banquet token status
- [x] Disable / Re-enable buttons per bowler per passport type
- [x] Redemption count summary (e.g., 142/450 pool party redeemed)

## Phase 15: Doorman Tablet Mode & Admin Help Guides
- [ ] Build PIN-protected Doorman Tablet Mode (/doorman-tablet): ED sets PIN in admin, tablet unlocks with PIN, camera QR scanner only — no separate login required
- [ ] Add camera-based QR scanner to admin panel (ED can scan bowler QR codes from their own tablet)
- [ ] Add contextual flip-card help guides throughout admin dashboard — one per major feature, collapsed/sleek by default
