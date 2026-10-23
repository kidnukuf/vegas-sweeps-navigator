# BowlVegas — App-wide scrolling audit and repairs

**Completed:** October 23, 2026  
**Scope:** All registered page families and shared scrolling, overlay, and form components in Vegas Sweeps Navigator.  
**Data safety:** Browser tests blocked application mutations. Protected-page layout tests used synthetic data. No live claim codes, event roster records, guest passes, passwords, or QR redemptions were changed by this audit.

## Result

The identified scrolling and viewport defects have been corrected in the project. Final measurable route views had no bottom-reachability or document-width overflow failures. Protected portal views, shared overlays, and table-to-page scrolling passed the final checks described below.

These are browser-engine and simulated viewport tests, not a guarantee for every physical phone, browser version, accessibility setting, or embedded webview. The saved checkpoint must be published through the project's publishing controls before production users receive the changed bundle.

## What was corrected

### Native page scrolling and mobile keyboards

The page keeps native vertical scrolling and pinch zoom available. The mobile viewport meta tag no longer limits zoom to one scale. A shared visible-viewport tracker sizes dialogs to the area remaining above a phone keyboard or browser toolbar, with a fallback for browsers without VisualViewport support.

Bowler and Captain authentication retain normal document flow, extra bottom space, and reachable submit controls. Delayed password-field focus scrolling stops after the user moves to another field, preventing a stale timer from pulling the page back. The security widget now uses supported compact sizing when a narrow form cannot fit its standard width; claim-code and server-side verification rules were not bypassed.

### Dialogs, installation prompts, sheets, and drawers

Shared modal sizing reacts to the visible viewport instead of relying only on the device's full screen height. Long content remains internally scrollable. Closing a modal restores normal page scrolling. Existing modal focus and background-scroll locks remain in place while the modal is open.

The app-install prompt no longer has duplicate close icons. Drawer content has its own scroll body and no longer shares the drag layer that could cover lower buttons. Bottom and side sheets stay within the visible viewport. Director forms and confirmations use the same scroll-safe patterns where appropriate.

### Bowler and Captain portal details

The event-schedule disclosure no longer clips long logistics content behind a fixed maximum expanded height. Its header is a real keyboard-operable button. Collapsed details are excluded from focus navigation, and each instance has a unique accessible target.

Hotel information uses the shared scroll-safe dialog. Long bulletin and communication text wraps rather than creating page-wide horizontal overflow. The Director's embedded bowler view has a reachable close control and a dedicated scrollable portal body.

### Owner and Event Director operations

The Owner event workspace now has an explicit narrow-screen grid track, allowing its roster table—not the entire page—to own horizontal overflow. This fixes Edit controls being pushed beyond the edge of a phone screen.

Director roster, event configuration, staff, passport, claim-code, confirmation, payout, and scan-log interfaces were reviewed for long-content and keyboard access. Fixed custom form overlays and table/list regions received viewport or keyboard-navigation safeguards where the audit found a concrete defect.

### Coordinator, imports, seating, and public pages

Coordinator management and handoff/review regions, import previews, seating tables, and relevant navigation lists received focusable scroll regions or responsive layout corrections. Long tables remain horizontally scrollable without trapping vertical page scrolling. The introductory splash no longer relies on restrictive page/body sizing, and its dismissal paths remain available.

### Online and offline door scanning

Online scanner layouts and generated offline scanner HTML now keep controls and outcome content reachable on short and landscape screens. Scanner lanes use overflow-safe centering so oversized result text does not begin above scroll zero. Existing age indicators, under-21 acceptance feedback, pass tokens, one-time redemption logic, and scanner capture behavior were preserved.

Already-downloaded offline HTML/ZIP packages do not update themselves; export a fresh package to include these layout changes.

## Final verification

| Verification | Final result |
|---|---|
| Broad route audit | 310 route/viewport attempts across 31 route variants, five viewport sizes, and two engines |
| Successfully measured route views | 301; zero bottom-scroll or document-width overflow failures |
| Protected-route navigation exclusions | 9 unauthenticated navigation interruptions: Owner 5, Director 4; these were not counted as passing layout measurements |
| Protected portal layout tests | 66 synthetic-data states across 11 portal states, three viewport sizes, and Chromium/WebKit; zero final scrolling assertions failed |
| Shared-component browser checks | 250 passing checks covering long dialogs, alerts, installation prompt, side/bottom sheets, drawers, body-scroll restoration, and the last option in a 100-center list |
| Table and bottom-action checks | 20 passing checks for the final table column, page-bottom reachability, and normal button taps |
| Focused Vitest suite | 33 tests passed in 11 files |
| TypeScript | Passed after temporary test-harness removal |
| Production build | Passed |
| Diff integrity | Passed `git diff --check` |

The five broad-audit viewport sizes were **320 × 568**, **390 × 844**, **667 × 320**, **768 × 1024**, and **1280 × 720**. Tests used Chromium and WebKit, including simulated mobile/touch contexts. Overlay tests also simulated a reduced visible viewport of 260 pixels with an offset of 60 pixels to represent keyboard/browser occlusion.

The protected-layout states covered Bowler and Captain dashboards and confirmation screens, Director roster editing, passports, claim codes, staff controls, Owner workspace confirmation, Coordinator portal, and Director coordinator management. These fixtures test the actual UI components without impersonating real attendees or granting production access.

## Interpretation and remaining limits

Two drawer trigger tests were interrupted during development-server/dependency reloads. Both states passed a targeted retest on the stable final server. Captain nested-message tests initially encountered Playwright's WebKit animation-stability timeout; native scrolling and pointer-hit checks subsequently confirmed that the controls were fully reachable. These results are consolidated without treating the earlier tooling interruptions as successful tests.

Unauthenticated Owner navigation leaves the page for sign-in and disrupted some broad-audit measurements. A few following Director navigations timed out in those contexts. Authenticated synthetic-data layout tests covered those portals separately; no authentication policy was relaxed to make the measurements pass.

Mobile WebKit's automation API does not support mouse-wheel input. Its phone-sized table tests used native keyboard End scrolling and normal button clicks instead. This does not substitute for a real-device swipe test.

Successful security-challenge completion, network availability, hardware scanner operation, every event's possible data shape, and every phone model were not certified by this scrolling audit. Physical iPhone/Android testing remains useful after publication. Ordinary wide data tables intentionally require horizontal scrolling inside their table regions; they should not stretch the document or prevent vertical page access.

The temporary in-app layout harness was removed before checkpointing. Browser scripts and detailed synthetic test evidence were retained outside the application repository for troubleshooting and repeatability.
