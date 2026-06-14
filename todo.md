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
- [ ] JWT sessions for all 5 roles with role-based route protection
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
