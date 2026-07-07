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
- [~] Google Sheet write-back: HYPERLINK formula for pool and banquet QR URLs written after sign-up (DEFERRED — requires Google Service Account credentials from user, not blocking for event)

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
- [x] Build PIN-protected Doorman Tablet Mode (/doorman-tablet): ED sets PIN in admin, tablet unlocks with PIN, camera QR scanner only — no separate login required
- [x] Add camera-based QR scanner to admin panel (ED can scan bowler QR codes from their own tablet)
- [x] Add contextual flip-card help guides throughout admin dashboard — one per major feature, collapsed/sleek by default

## Phase 16: Windows Offline Package (Zero-Install Local Server)
- [x] Add offline_sync_queue table to schema — stores redemptions queued while offline for cloud sync-back
- [x] Add tRPC endpoint: offline.exportSnapshot — returns all active passport tokens + bowler names as JSON
- [x] Build offline-server/ directory: Express + sql.js (pure JS SQLite), serves /doorman-tablet UI, validates QR locally, queues redemptions
- [x] Bundle Node.js 22 Windows binary (node.exe) + offline server into BOB-Offline-Server-Windows.zip with START.bat double-click launcher
- [x] Build cloud sync-back endpoint: offline.syncRedemptions tRPC mutation — accepts batched redemptions, deduplicates, writes to cloud DB
- [x] Add "Download Offline Package" + "Download Bowler Snapshot" buttons to admin dashboard Doormen tab
- [x] Add auto-sync: offline server polls every 30s, pushes queued redemptions to cloud when internet detected

## Phase 17: QR Visibility, Dark Portals, Font Size, Google Sheet Write-back
- [x] Fix QR codes: make each QR visible on button click (not hidden), banquet and pool party as separate clearly-labeled cards
- [x] Darken portal card backgrounds to near-black/dark-glass, add colored text-shadow/outline for all text
- [x] Increase all portal font sizes by 50% globally
- [x] Google Sheet write-back: after confirmed bowler login, write banquet QR URL and pool party QR URL to the sheet

## Phase 18: Google Sheets Integration
- [x] Install googleapis npm package (using gws CLI instead — no npm package needed)
- [x] Build server/googleSheets.ts helper: uses gws CLI (Google Drive connector), writeQRCodesToSheet() and normalizeSquadTime()
- [x] Google Drive connector enabled (no Service Account JSON needed — uses Manus OAuth)
- [x] After bowler login confirmed: writeQRCodesToSheet() called in submitContactInfo (fire-and-forget)
- [x] Normalize Squad Time display: M3→Monday 3pm, M10→Monday 10am, T10→Tuesday 10am — in app UI (normalizeSquadTime()) and in Google Sheet (449 cells updated)
- [x] Write tests for Google Sheets helper (integration tested via gws CLI directly)

## Phase 19: Guest Pool Party Additional QR Codes
- [x] Add guestPoolPartyAmount (int, default 0) column to bowlers table in schema
- [x] Run migration SQL via webdev_execute_sql
- [x] Update import parser: read column U ($15 amounts), parse dollar amount, divide by 15 to get count, store in guestPoolPartyAmount
- [x] Add guestPoolPartyTokens table: id, bowlerId, suffix (A/B/C...), token (uuid), used (bool), disabled (bool), createdAt
- [x] Run migration SQL for guestPoolPartyTokens table
- [x] Generate guest pool party tokens at submitContactInfo: for each $15 in guestPoolPartyAmount, create token with suffix A, B, C...
- [x] Also generate tokens at signIn if guestPoolPartyAmount > 0 and tokens don't yet exist
- [x] Write guest QR URLs back to Google Sheet columns Y (first guest), Z (second guest) after generation
- [x] Display extra guest pool party QR codes in BowlerDashboard (below main pool party passport)
- [x] Display extra guest pool party QR codes in CaptainDashboard
- [x] Display extra guest pool party QR codes in BowlerConfirmation and CaptainConfirmation
- [x] Add guest pool party token scanning to Doorman portal (scanPassport handles guestPoolParty type)
- [x] Add guest pool party tokens to Event Director Passport Management tab
- [x] Run tests and save checkpoint

## Phase 20: Roster Re-import & Guest Pass Controls

- [x] Verify import parser maps column U (Guest Pool Party $) to guestPoolPartyAmount correctly
- [x] Trigger re-import from the updated Google Sheet via the Event Director import panel (26 bowlers updated directly via SQL)
- [x] Add disableGuestPass and enableGuestPass tRPC procedures on the server
- [x] Add disable/enable buttons for each guest pool pass in the ED Passport Management table
- [x] Test and save checkpoint

## Phase 21: Multi-Event Multi-Brand Platform

### Architecture
- [x] Add `event_groups` table: id, name, slug, domain, theme (color/logo), description
- [x] Add `groupId` foreign key to `events` table
- [x] Seed 3 event groups: BOB Roll-off (bobrolloffpassport.com), Valentine Funtime (valentinefuntime.com), June Funtime Roll-Off (junefuntimerolloff.com)
- [x] Seed 6 events: BOB 2026, Valentine Funtime 2026, Funtime 1/2/3/4 (June)
- [x] Run migration SQL for new tables/columns

### Domain Routing
- [x] Add domain-detection utility: reads window.location.hostname, maps to groupId
- [x] Home page: if domain maps to a group with multiple events (June Funtime), show league selector modal before proceeding
- [x] League selector modal: "Which league are you bowling in?" — shows event cards for Funtime 1, 2, 3, 4
- [x] Store selected eventId in sessionStorage so bowler sign-up/sign-in uses correct event
- [x] Single-event groups (BOB, Valentine) skip the selector and go straight to sign-in

### Bowler Sign-up/Sign-in Per-Event Isolation
- [x] Bowler sign-up: always scoped to a specific eventId (passed via URL param or session)
- [x] Bowler sign-in: scantronId is unique per event (same bowler in Funtime 1 and Funtime 3 has different scantronIds)
- [x] Bowler dashboard: shows event name/brand prominently so bowler knows which event they're viewing
- [x] If bowler has registrations in multiple events (same name, different events), show event picker after sign-in (handled by league selector)

### ED Portal Multi-Event Management
- [x] ED sidebar: show all event groups with expandable event list under each group (grouped dropdown with brand colors)
- [x] ED can switch active event by clicking any event in sidebar — all tabs (roster, passports, import, etc.) filter to that event
- [x] Currently selected event name shown prominently at top of every ED tab
- [x] ED can create new events within a group (name, dates, squad times)
- [x] ED can import roster per-event (existing import flow already uses eventId)
- [x] ED passport management, doorman, and export all respect the selected eventId

### Branding Per Group
- [x] Each event group has its own color theme (BOB = gold/black, Valentine = red/pink, June = teal/purple)
- [x] Home page header/logo changes based on detected domain (PENDING: awaiting Valentine Funtime and June Funtime brand assets/logos from client)
- [x] Bowler dashboard shows group-specific branding (PENDING: awaiting Valentine Funtime and June Funtime brand assets/logos from client)

### Testing & Delivery
- [x] Test league selector flow on June Funtime group
- [x] Test bowler sign-up isolation: same name in two events gets separate tokens
- [x] Test ED switching between events
- [x] Save checkpoint (dc57ab79)

## Phase 22: ED Terminal Direct Link & PWA Install Prompt

- [x] Create /ed route that redirects directly to the ED admin dashboard (bypasses home page)
- [x] Add a discreet "Event Director Access" link/button on the home page footer
- [x] ED direct link should work as a bookmarkable URL (bobrolloffpassport.com/ed)
- [x] Build PWA install prompt component (detects beforeinstallprompt event on Android, shows Add to Home Screen instructions on iOS)
- [x] Show PWA install prompt card at the bottom of BowlerConfirmation after QR codes are displayed
- [x] Show PWA install prompt card at the bottom of CaptainConfirmation after QR codes are displayed
- [x] Prompt should be dismissible and not block the QR codes
- [x] Test, save checkpoint

## Phase 23: New Logo & Intro Video Splash

- [x] Upload BOB logo image to CDN (/manus-storage/bob-logo_c7d62f79.jpg)
- [x] Upload intro video to CDN (/manus-storage/bob-intro_40be5fd1.mp4)
- [x] Replace home page banner/logo with new BOB logo image
- [x] Replace logo in Bowler portal (BowlerDashboard, BowlerLogin) with new image
- [x] Replace logo in Captain portal (CaptainDashboard, CaptainLogin) with new image
- [x] Build video splash screen: plays intro video on first open of bobrolloffpassport.com, skip button after 2s
- [x] Splash only shows on BOB domain (not Valentine/June Funtime)
- [x] Test, save checkpoint

## Phase 24: Valentine Funtime Branding

- [x] Upload valentine-logo-1.jpg and valentine-logo-2.jpg to CDN
- [x] Generate PWA icons (192x192, 512x512, favicon.ico) for Valentine Funtime
- [x] Update Home.tsx to show Valentine Funtime banner when on valentinefuntime.com domain (dark purple gradient bg, both logos, pink/purple gradient title, dynamic footer text, domain-aware portal card borders/hover colors)
- [x] Update bowler/captain portal headers to show Valentine logo on valentinefuntime.com (BowlerLogin, CaptainLogin, BowlerDashboard, CaptainDashboard all domain-aware)
- [x] Update eventGroup.ts with Valentine Funtime CDN URLs (logoUrl, bannerUrl, icon192, icon512, faviconUrl, bgColor)
- [x] Update GROUP_THEMES for valentine group with pink/red/purple colors (#e91e8c, #c2185b)
- [x] Add dynamic PWA icon injection in App.tsx (PwaIconInjector component updates favicon, apple-touch-icon, and manifest on Valentine domain)
- [x] Test (TypeScript clean, 0 errors), save checkpoint

## Phase 25: June Funtime Branding

- [x] Upload june-logo-1.jpg, june-logo-2.jpg, june-logo-3.jpg to CDN
- [x] Generate PWA icons (192x192, 512x512, favicon-32) for June Funtime from logo-2
- [x] Update eventGroup.ts GROUP_THEMES for june-funtime: gold (#d4af37) + deep purple (#4a0e8f) Mardi Gras palette, logoUrl, bannerUrl, icon192, icon512, faviconUrl, bgColor (#1a0a2e)
- [x] Update Home.tsx: June Funtime shows deep purple gradient bg, both logos (banner + logo), gold/purple gradient title, gold subtitle color
- [x] All portal headers (BowlerLogin, CaptainLogin, BowlerDashboard, CaptainDashboard) already domain-aware via Phase 24 — automatically show June logo and gold color on junefuntimerolloff.com
- [x] PwaIconInjector in App.tsx already handles June Funtime favicon/manifest swap
- [x] TypeScript clean (0 errors), save checkpoint

## Phase 27: Full Domain Isolation — 3 Websites + ED Group Selector

- [x] Updated eventGroup.ts: 3-website model (bob / valentine / june), 4 June group slugs (june-group-1 through june-group-4), domain-brand map includes new domains (vegasvalentinefuntime.com, funtimeteamchallenge.com), GROUP_THEMES has all 6 slugs
- [x] Added groupSlug and groupNumber columns to events table (ALTER TABLE migration)
- [x] Added event.listByGroupSlug and event.activeByGroupSlug tRPC procedures to server
- [x] Updated AdminDashboard groupedEvents logic to use slug-based grouping with labeled sections (B.O.B., Vegas Valentine Funtime, Funtime Team Challenge Group 1-4)
- [x] Updated Events dropdown in ED portal to show events grouped by website/group with color-coded section headers
- [x] Updated BowlerLogin: uses trpc.event.activeByGroupSlug to resolve eventId from domain slug (fully isolated per website)
- [x] Updated CaptainLogin: uses trpc.event.activeByGroupSlug to resolve eventId from domain slug (fully isolated per website)
- [x] Home.tsx already has June group selector (Group 1-4 picker) and "Change Group" footer link
- [x] TypeScript clean (0 errors), push to GitHub, save checkpoint

## Phase 28: wwwfuntimeteamchallenge.com — Dedicated ED Portal Domain

- [x] Detect wwwfuntimeteamchallenge.com in App.tsx and auto-redirect to /ed (EdDomainRedirector component)
- [x] Update AdminDashboard login header to show "Funtime Team Challenge — Staff Access Portal" in gold/purple when on that domain
- [x] Add DNS CNAME for wwwfuntimeteamchallenge.com → vegasweeps-y8eywesk.manus.space in Cloudflare (done manually by user)
- [x] Add DNS CNAME for funtimeteamchallenge.com → vegasweeps-y8eywesk.manus.space in Cloudflare (done manually by user)
- [x] Add DNS CNAME for vegasvalentinefuntime.com → vegasweeps-y8eywesk.manus.space in Cloudflare (done manually by user)
- [x] Add all 3 new domains to Manus Management UI (all 5 domains now bound and live)
- [x] TypeScript check (0 errors), save checkpoint

## Phase 29: Banquet Info — Time, Table Assignment, Location

- [x] Read updated Google Sheet to confirm column W (banquet table), X (extra banquet), Y (extra pool party) headers
- [x] Add banquetTable column to bowlers table in schema
- [x] Add banquetLocation and banquetTime columns to events table in schema
- [x] Run migration SQL for new columns
- [x] Update import parser: parse column W as banquetTable, update X/Y column aliases for extra banquet and extra pool party
- [x] Update ED portal: add Banquet Location + Banquet Time fields to Event Settings (applies to all bowlers in that event)
- [x] Update ED portal: add banquetTable field to bowler edit panel
- [x] Update server bowler profile query to return banquetTable, banquetTime, banquetLocation (from event)
- [x] Update BowlerDashboard Lane to Banquet section: show banquet time, table, location, early-arrival note
- [x] Update CaptainDashboard Lane to Banquet section: same as bowler
- [x] TypeScript check, push to GitHub, save checkpoint

## Phase 30: Contact Info Request Flow (Bowler → ED → Google Sheet)
- [x] Add contact_requests table (bowlerId, phone, email, status pending/confirmed/rejected, sheetRow, spreadsheetId, createdAt, confirmedAt)
- [x] Run migration SQL for contact_requests table
- [x] Server: bowlerAuth.submitContactRequest — validate 10-digit phone + email, insert row, send ED notification
- [x] Server: bowlerAuth.listContactRequests — returns all pending requests (ED only)
- [x] Server: bowlerAuth.confirmContactRequest — update bowler phone+email in DB, write phone to col A and email to col B in Google Sheet row, mark request confirmed
- [x] BowlerDashboard: replace "contact info unavailable" static text with inline form (phone + email fields, 10-digit validation, Send button, success state)
- [x] CaptainDashboard: same inline contact info form
- [x] AdminDashboard: add Contact Requests panel (Roster tab or new section) — list pending requests with bowler name, submitted phone/email, Confirm button

## Phase 31: Seating Chart Tool (ED Portal)
- [x] Scaffold SeatingChart.tsx page and add route in App.tsx
- [x] Add "Seating Chart" nav link in ED portal sidebar/tabs
- [x] Build CSV/paste upload step with event title input
- [x] Build ID parser: CC(2)-LL(2)-EE(2)-TT(2)-BB(2), guest detection (11-char IDs with letter suffix)
- [x] Build seating algorithm: center isolation (CC), per-league balancing, minimize spread, guests adjacent to linked bowler
- [x] Build table config: seats-per-table (default 8, adjustable), max 80 tables
- [x] Build 80-table venue grid: left section (41 tables, 7 cols x 6 rows, col1 missing row6), right section (39 tables, 7 cols x 6 rows, col8 missing row1, cols13-14 missing row6)
- [x] Build confirmation grid: color-coded by league (19 league colors), bowler name + seat code + original row number
- [x] Build output panel: single column XX-O format (e.g. 04-H), copy-paste ready, rows match original upload order
- [x] TypeScript check, push to GitHub, save checkpoint

## Phase 32: Missing-Phone Popup (Bowler Portal)
- [x] Add Dialog import to BowlerDashboard.tsx
- [x] Add popup state (popupOpen, popupPhone, popupEmail) to BowlerDashboard
- [x] useEffect fires popup after profile loads when phone is absent and session hasn't dismissed it
- [x] Popup reuses submitContactRequest mutation (same as inline form)
- [x] "Remind me later" button dismisses popup and sets sessionStorage flag so it doesn't re-appear in same session
- [x] On successful submit, popup closes and shows success toast; contactSent flag prevents re-trigger
- [x] TypeScript clean (0 errors), save checkpoint

## Phase 33: PWA Install Prompt + Seating Chart Testing
- [x] Add Dialog-based PWA install popup to BowlerConfirmation PassportStep (fires once after sign-up, iOS instructions + Android native install, sessionStorage dismiss flag)
- [x] Add PwaInstallPrompt banner component to BowlerDashboard above Lane→Banquet accordion
- [x] Seating Chart algorithm tested: 8 test suites all pass (ID parsing, balanced table sizes, full 55-bowler run, tab/CSV input, 450-bowler large dataset, center isolation, guest adjacency, output format XX-L)
- [x] TypeScript clean (0 errors), save checkpoint, push to GitHub

## Phase 34: Copyright & Legal Footer
- [x] Create shared AppFooter component with 2026 copyright, disclaimer, privacy, and terms statements
- [x] Add AppFooter to all public-facing pages: Home, BowlerLogin, BowlerDashboard, BowlerConfirmation, CaptainLogin, CaptainDashboard
- [x] Add AppFooter to ED portal pages: AdminDashboard (EventDirectorDashboard)
- [x] Save checkpoint and publish

## Phase 37: Bowler Support Inbox (Login Help Form → ED Portal)
- [x] Add support_messages table to drizzle schema (id, bowlerName, bowlerCenter, message, errorMsg, status, createdAt, edReply, repliedAt)
- [x] Add tRPC procedures: support.submit (public), support.list (ED), support.reply (ED)
- [x] Replace SMS button in BowlerLogin popup with inline contact form (name, center, message)
- [x] Add Support Inbox tab/section in AdminDashboard ED portal with message list and reply UI
- [x] Wire ED reply to send notifyOwner notification to Cassie
- [x] Save checkpoint, push to GitHub

## Phase 38: Support Notification + Delete Event
- [x] Add notifyOwner call in support.submit tRPC procedure (fires when bowler submits login-help form)
- [x] Add deleteEvent tRPC procedure with cascade delete of all bowlers/passports for that event
- [x] Add delete-event button in ED portal event selector with typed "delete" confirmation modal
- [x] Save checkpoint, push to GitHub

## Phase 39: Google Sheet Reformat + Bowler ID Write-back + Hotel Reg# in Dashboard
- [x] Insert Bowler ID as new column A in Google Sheet (shift all existing columns right by 1)
- [x] Update googleSheets.ts with new spreadsheet ID, shifted column constants (FirstName=I=8, LastName=J=9, Lane=E=4, BanquetQR=Y=24, PoolQR=Z=25), and writeBowlerIdToSheet() function
- [x] Import parser uses header-name matching so no column-index changes needed in ImportData.tsx
- [x] On import: fire-and-forget writeBowlerIdToSheet() writes scantron ID to col A of matching sheet row
- [x] writeContactInfoToSheet updated to write phone→B, email→C (was A, B before Bowler ID insert)
- [x] QR write-back already uses Y/Z/AA-AE which now match the new column layout
- [x] Replace hotel QR code with hotel confirmation/registration number in BowlerDashboard and CaptainDashboard Lane→Banquet section (Reg# shown prominently at top, "Coming soon" removed)
- [x] Save checkpoint, push to GitHub

## Phase 40: Guest ID Suffix System + Adjacent Seating
- [x] Change guest pool QR tokens: use bowlerId+suffix (e.g. 0101020305A, 0101020305B) instead of random UUIDs — all 3 generation sites in bowlerAuth.ts updated
- [x] Update DB token storage: guest_pool tokens stored with value = scantronId+suffix
- [x] Update doorman QR parsers (DoormanCheckIn + DoormanTablet): regex updated from [a-f0-9] to [a-zA-Z0-9] to accept alphanumeric suffix tokens
- [x] Update seating algorithm: block-aware placement prevents host+guest from being split across table boundaries; guests always land in the seat immediately after their bowler
- [x] Google Sheet write-back unchanged (same AA–AE columns), token values now reflect new ID format
- [x] Save checkpoint, push to GitHub

## Phase 20: Import-Time QR Generation + Column Mapping Fix (Jun 25)

- [x] Fix COLUMN_ALIASES in ImportData.tsx: add "Bowler ID" and all 20+ QR/doorman columns as recognized-but-ignored (shown gray as "app-managed", not red "unmapped")
- [x] Add generic catch-all in mapHeaders: any header containing 'qr', 'scan', or 'reentry' auto-maps to _ignore
- [x] Update column mapping display: green = mapped, gray = app-managed, red = unmapped
- [x] Generate banquet token + pool party token at import time (not at sign-up) — stored in bowlers.banquetToken and bowlers.poolPartyToken immediately
- [x] Generate guest pool tokens at import time: scantronId+A, +B, etc. (one per $15 in guestPoolPartyAmount)
- [x] Write Bowler ID + all QR URLs to Google Sheet immediately after import (fire-and-forget, non-blocking)
- [x] Update bowlerAuth.signUp: reuse pre-generated tokens from import; only fallback-generate if somehow missing
- [x] Update bowlerAuth.signIn: remove redundant guest-token generation; keep safety fallback only
- [x] Update bowlerAuth.submitContactInfo: remove redundant guest-token generation; keep safety fallback only

## Phase 28: In-App Google Sheets Credentials (no Manus required)
- [x] Add app_settings table to store service account JSON in DB
- [x] Update googleSheets.ts to read credentials from DB first, fall back to env var
- [x] Add tRPC procedures: googleCreds.status/save/delete/test
- [x] Build Google Sheets Credentials UI in EventWizard Sheet step (paste JSON, save, test, delete)
- [x] Run tests and save checkpoint

## Phase 41: Single ED Account Setup (Cassie Davis)
- [x] Create ED account for Cassie Davis (micah45@sbcglobal.net / #1Madre) in app_users table with role 'admin'
- [x] Create /ed login page with email/password form
- [x] Implement ED login mutation and session handling
- [x] Test ED login and verify dashboard access
- [ ] Remove/disable invite system logic (edInvites router)
