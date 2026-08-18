# Owner Portal Operations — Implementation Draft

## Purpose

The private Owner Portal will become the operating workspace for creating an event, creating an Event Director account, assigning that director to one or more events, and opening any selected event without leaving the owner workflow. These capabilities will remain restricted to the authenticated Manus project owner and will not expose account-management controls to Event Directors.

## Section 1 — Owner Event Creation

The Owner Portal will include a **Create Event** action above the event-validation table. It will collect the event name, year, company, brand/group, planning status, date window, bowling date and squad time, Google Sheet ID/tab, banquet details, pool-party settings, and T-shirt pickup information. The new event will open immediately in the existing owner event editor so you can complete or adjust details before importing any bowlers.

No database tables are required. The implementation will add an owner-only event-create procedure that validates the selected company and group, inserts the event in planning status, records an owner audit entry, and returns the new event ID.

## Section 2 — Event Director Credentials

The Owner Portal will include an **Add Event Director** action. You will enter the director’s name, username, temporary password, company, and optional initial event assignments. The password will be securely hashed before storage and will never be shown again after creation. The account will receive only the `event_director` role; it will not receive owner or platform-administrator privileges.

Existing Event Directors will be visible in an owner-only directory. From that directory, you will be able to reset a director password and change the director’s event assignments. The implementation reuses the current `ed_staff` and `event_director_assignments` model rather than creating a second credential system.

## Section 3 — Event Assignment and Direct Access

Each event row will gain a prominent **Open Event Workspace** action. It will select the event, preserve the selection in the Owner Portal URL, and open the existing owner event configuration and roster workspace. The event workspace will provide direct links to Sheet Tools and the Event Director view while keeping the owner context active.

Each Event Director record will support assignment to zero, one, or multiple events within the same company. The event table will display assigned directors, and the existing Event Director filter will continue to provide one-click portfolio review.

## Section 4 — Security and Auditability

Every create, credential reset, assignment change, and event creation will require the existing owner authorization check and create an audit-log entry. Password hashes will remain server-only. The UI will never list password values after submission. Event deletion and bowler deletion will retain their existing typed-confirmation safeguards.

## Open Decisions

| Decision | Recommended default | Why it matters |
|---|---|---|
| New director assignments | Allow an Event Director account to be created without an event, then assign later | Lets you prepare staff credentials before their event is created or finalized. |
| New event setup | Start with core setup fields and open the detailed owner editor immediately afterward | Keeps creation fast while preserving access to the full existing configuration. |
| Owner event access | Open the selected event inside the Owner Portal, with an optional link to Sheet Tools | Avoids impersonating the Event Director and keeps owner oversight controls available. |

## Validation Plan

Vitest coverage will verify owner-only authorization, event creation validation, secure credential creation, no duplicate username creation, multi-event assignment updates, and safe direct event selection. TypeScript validation, route rendering, and visual checks will be completed before publication.

## Implementation Constraints & Notes

1. Do not weaken the existing Manus-owner authorization boundary.
2. Reuse `ed_staff`, `event_director_assignments`, existing password hashing, and audit logging; do not create duplicate identity systems.
3. Keep passwords server-only and never return a hash or reusable password from a query.
4. Preserve current Event Director access, existing staff accounts, and all event data.
5. Cover every new tRPC procedure with Vitest before delivery.
6. No schema migration is expected unless the audit model requires a new action type.

## Model Recommendation

**Max** is recommended because the expansion coordinates privileged access control, credential handling, event creation, assignment data, owner workflows, and existing multi-portal behavior.
