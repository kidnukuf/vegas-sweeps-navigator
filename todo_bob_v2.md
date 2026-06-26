# B.O.B. Roll-off Passport v2 — Implementation TODO

## Section 1 — Create New Event Wizard
- [x] Add nullable event columns (hotel checkin/out, registration, tshirts, pool party, banquet, survey toggles)
- [x] Add tshirtsReceived boolean to bowlers table
- [x] Multi-step Create New Event wizard (8 steps) in ED portal
- [x] Edit Event Settings button reopens wizard
- [x] Dynamic Lane to Banquet placard (only steps with data, chronological)
- [x] Orleans Hotel info card modal (HTML text + uploaded image), triggered on checkin/checkout tap
- [x] Captain Portal T-Shirt Distribution card + mark received -> purple sheet cell

## Section 2 — QR Security, Re-Entry & Guest Access
- [x] reentry_tokens table (with braceletNumber, passportType)
- [x] guest support via extended guest_pool_party_tokens (guestId, banquetToken, eventId)
- [x] Verify used-token rejection at API level (reentry single-use enforced; guest-id logic vitest)
- [x] Doorman: Issue Re-Entry Pass screen (bracelet number input -> generate QR)
- [x] Doorman scanner accepts re-entry tokens, shows bracelet number on redemption
- [x] Guest Bowler ID system (scantronId + A/B/C) persisted
- [x] Generate guest pool + banquet QR at import
- [x] Guest passes section in Bowler Portal (below pool party box)
- [x] Guest passes section in Captain Portal
- [x] Guest re-entry flow (same reentry router, works for any bracelet holder)
- [x] Write guest IDs + QR URLs back to Google Sheet (existing pipeline)

## Section 3 — Advertisements
- [x] advertisements table
- [x] ED Advertisements management tab (upload image/video, tier, run-until, hyperlink, enabled)
- [x] Two ad slots in Bowler + Captain portals
- [x] Weighted client-side rotation (Bronze 1x, Silver 2x, Gold 4x)
- [x] Video autoplay muted + unmute badge; hyperlink wrap; reduced-motion

## Section 4 — Post-Event Survey
- [x] survey_responses table (unique bowlerId+eventId)
- [x] Survey form gated by surveyEnabled + ED-controlled surveyOpen
- [x] ED Survey Controls card (open/close survey, low-rating owner alert)
- [ ] Checkout-time auto-notification via heartbeat (deferred — ED opens survey manually for now)
- [x] ED Survey Results tab (averages, table, CSV export)
- [x] Testimonials sub-tab (permission=true)

## Section 5 — ED Guided Help System
- [x] Reusable collapsible GuidedHelpPanel (plain + professional + what's next)
- [x] localStorage persistence per panel ID, default collapsed
- [x] Guide tab with all 9 workflow steps + panels on ads/survey tabs

## Finalize
- [x] Vitest tests for new logic (bobLogic.test.ts, 14 tests; fixed 3 stale googleSheets tests)
- [x] TypeScript check passes (no errors)
- [x] Checkpoint + GitHub push

## Bug Fixes
- [x] Fix 350-bowler import error: undefined→null in hotel/payment upserts (MySQL2 rejects undefined bind params)
- [x] Fix ImportData.tsx "Skipped" label (was showing errors count; now shows real skipped + errors separately)
- [x] Fix Squad Day & Time column alias in server import parser
- [x] Harden upsertHotelRecord/upsertPaymentRecord to filter undefined values defensively

## Offline Single-Laptop Scanner (Banquet + Pool Party) — v1
- [x] Add door_scan_log table to drizzle schema
- [x] Add reentry_codes table to drizzle schema
- [x] Generate + apply migration via webdev_execute_sql
- [x] db.ts helpers: loadDoorData query, ensureReentryPool, recordSyncedScan, recordReentryEvent
- [x] tRPC offlineDoor router: loadData, sync, reentryIssue/release (protected)
- [x] Client IndexedDB store (idb): guests, scanLog, reentryPool, meta object stores
- [x] Client validation engine: lookup/used/notfound decision order + debounce + per-scan lock
- [x] Connectivity + auto-sync service (online/offline + ping, idempotent flush)
- [x] Scanner window UI (Door A / Door B fullscreen, 1 scanner each), green/red flash + audio
- [x] Console: mode toggle, online/offline indicator, counts, Load Door Data, Sync Now
- [x] Step-Aside resolution queue: name/team lookup, reason, PIN override-admit, ED flag
- [x] Reentry manager UI: N/E/S/W zones, issue with wristband #, zone-locked validation
- [x] Route wiring in App.tsx for new offline doorman page
- [x] Vitest: validation order, idempotent sync, reentry zone-lock, double-dip
- [x] references/door-kiosk-setup.md setup guide
- [ ] Single checkpoint at end
