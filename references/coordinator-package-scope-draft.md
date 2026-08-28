# Coordinator Package — Scope Draft

## Purpose

The **Coordinator Package** should make roster collection feel simple for a league coordinator while preserving the Event Director’s control over data quality, event setup, and claim-code activation. It should support several leagues from the same center attending one event, give coordinators one obvious place to submit roster and special-request details, and provide an attractive, printable handoff package for league night. To minimize change resistance, every coordinator can choose either a familiar downloadable sheet/CSV template or a matching web form.

The supplied example sheet is a useful source format. It has a title row and a second grouping row before the actual headers, then captures squad time, lane, center, team number and captain, bowler names, gender, under-21 status, sanction number, game and average information, team information, shirt size, hotel dates and rooming details, amounts, and special notes. The coordinator intake must therefore **detect the real header row** rather than assume row 1 is the header.

## Proposed End-to-End Flow

| Stage | Coordinator experience | Event Director experience | Result |
|---|---|---|---|
| 1. Invite | Receives a branded one-time code and event-specific signup link from the Event Director. | Creates, tracks, reissues, and revokes coordinator invitations for the event and center. | Only approved coordinators can create a workspace profile. |
| 2. Basic roster | Adds one bowler per row: name, center, league session, email, phone, team number, team name, captain, and any known notes. | Sees a center-and-league completion dashboard. | Enough information to approve early claim-code issuance. |
| 3. Early audit and owner handoff | Receives a clear status: needs correction, submitted, or accepted. | Audits the basic roster and marks it ready for initial owner import. | No automatic app import occurs. |
| 4. Initial app generation | Receives a printable claim-code packet after owner approval. | Downloads and distributes the approved packet by center and league. | The Owner performs the billable initial app import and generates the required app data and claim codes. |
| 5. Detail completion | Uses the same web form or template sheet to add bowling, hotel, shirt, guest, and rooming details later. | Reviews, corrects, and prepares the completed data for a final owner import. | Full operational data is completed without delaying initial onboarding. |
| 6. Follow-up | Uses a concise completion checklist and contact path for changes. | Sees outstanding roster-detail completion counts. | Fewer support messages and clearer ownership. |

## Coordinator Invitation, Account, and Live Oversight

The Event Director initiates every coordinator relationship from the secure ED Portal. They choose the event, center, and relevant league session(s), then create a **single-use coordinator invitation code** valid for 72 hours. The coordinator opens the associated signup link, enters the code, confirms their email address as their username, and creates a password. The invitation then becomes redeemed and cannot be used again. The Event Director may revoke an unused invitation or issue a replacement at any time.

The coordinator profile is limited to its assigned event, center, and league session(s). It cannot reveal other coordinators, centers, event operations, scanner data, QR usage, or the master Google Sheet. The Event Director sees a live coordinator dashboard with each invitation’s status, roster completion counts, last activity, source type, and outstanding errors. The Event Director can correct coordinator-entered values and view an append-only audit timeline showing who changed a field, when it changed, and the prior and new values.

## Coordinator-Facing Intake

### A. Center and League Setup

The coordinator starts with an event-specific link. The screen identifies the event, deadline, Event Director contact, center, and the league(s) they are responsible for. It should support multiple leagues at the same center by treating **League Session / Day & Time** as a first-class field and grouping the roster by **Center → League Session → Team**.

The intake should create a clear roster card for every league, showing the number of submitted bowlers, teams, missing contact details, and unresolved requests. This is better than one long, undifferentiated spreadsheet for a center with multiple league nights.

### B. Minimum Pre-Registration Fields

To support early roster audit and claim-code preparation, collect these fields first: first name, last name, center, league session/day and time, team number, team name, captain indicator, email, phone, and any initial request or note. The form should request all remaining coordinator information at this stage but allow it to be completed later. It should show an explicit **missing contact information** warning rather than reject an otherwise usable roster. The Event Director can mark this minimum roster ready for the Owner, who performs the initial app import and generates codes before later bowling, hotel, and shirt details are complete.

### C. Completion Fields

The later completion step should include the applicable items from the supplied sheet: lane, under-21 status, sanction number, games, best average, shirt size, hotel confirmation, check-in and check-out dates, room type, roommate name, and coordinator notes. Event-specific choices such as pool or banquet participation should appear only when the Event Director has enabled them.

### D. Special Requests

Provide structured categories first, with a short optional note: rooming, accessibility accommodation, hotel timing, event ticket/guest request, bowling schedule/lane concern, and other. The helper text should ask coordinators not to include detailed medical information in free-text notes. Each request needs a status: **new**, **reviewing**, **resolved**, or **needs coordinator follow-up**.

## Data Import and Validation Rules

The coordinator-facing template must contain only coordinator-entered fields. It must never display Bowler ID, Pool/Banquet QR, entry-used status, survey fields or answers, claim code, bill breakdown, team score, or other app-generated values. The current **Coordinator Import** page should remain the Event Director’s no-write validation and export tool. It should be enhanced later to recognize a title row and grouping row before headers, then locate the first row containing a threshold of known fields. It should keep its existing protections: no QR creation, no door updates, no account creation, and no Google Sheet write.

Validation should flag, never guess: unrecognized center, missing center code, missing team number or bowler position, missing required event codes, duplicate people, more than two squads, and malformed contact details. A parsed-data preview and an error table should remain visible before download.

## Claim-Code and Printable Package

The coordinator package should have two versions.

| Item | Digital coordinator packet | Printable league-night packet |
|---|---|---|
| Welcome | Event name, dates, coordinator role, and contact details | Cover sheet for the coordinator or captain |
| How Bowl Vegas works | Three-step explanation: claim code, account, personal event portal | Brief bowler instruction card beside each code |
| Roster checklist | Missing fields, errors, team completion, and deadlines | Team/center distribution checklist |
| Claim-code materials | Secure view-only status and reprint request link | Center and league-grouped team cards with QR code, bowler name, and claim code |
| Excitement content | Benefits: personalized schedule, QR tickets, event information, and reminders | “What happens next” and Event Director contact block |
| Changes | Structured request form | Printed change-request instructions, not handwritten codes |

Claim codes should be generated as soon as the Event Director has audited the minimum roster and the Owner has run the initial app import. The codes must remain unique, be grouped by center and league session, and be reprintable without regeneration. The existing eight-team-per-page layout can remain the default, with center and league session displayed above each team section.

## Access and Data Boundaries

Coordinators should have an Event Director-issued, single-use invitation code and must create a profile with their email address as username and a password. They can enter and later complete data only for their assigned event, center, and league session. They must not see another center’s roster, Event Director controls, scanner data, QR usage, master-sheet details, or app-generated data. Event Directors can review their created events only and have live visibility, editing, and audit access for their invited coordinators, but cannot perform app import or app-generated data creation. The Owner Portal remains able to review all events, coordinators, package status, exceptions, initial app imports, final imports, and all app-generated data.

## Recommended First Release

The first release should include: Event Director-issued coordinator invitations; coordinator account signup; a center-and-league-scoped coordinator web form; the adaptive file/template import path; structured special requests; real-time Event Director review, editing, and audit history; an approval screen; early roster completeness status; and a printable, center-and-league grouped claim-code package.

The following should be deferred until the core flow is proven: automated reminder emails/texts, two-way Google Sheet synchronization, coordinator self-service QR reprints, and multi-event coordinator dashboards.

## Decisions Needed Before Implementation

1. Confirm that “7w hour” means a 72-hour unused invitation expiry. The recommended implementation allows immediate Event Director revocation and reissue.
2. Confirm the proposed early app-import threshold: first name, last name, center, league day/time, team number, team name, captain, email, and phone. The form will ask for all other data but permit later completion; missing email/phone will be shown as a warning for Event Director review.
3. Confirm that every special request is submitted by the coordinator and audited/resolved by the Event Director, while the Owner’s role remains final import and app-data generation rather than request adjudication.

## Implementation Constraints

1. Do not begin package implementation until the scope decisions above are confirmed.
2. Preserve the existing Event Director, Owner, Bowler, claim-code, and master-sheet workflows.
3. Do not automatically write to Google Sheets or create operational QR data from an unapproved coordinator submission.
4. Any new coordinator data must be scoped by event, center, and the owning Event Director.
5. Add Vitest coverage for role scoping, approval gating, roster completeness, and claim-code distribution behavior.
