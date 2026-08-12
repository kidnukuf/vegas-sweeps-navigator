# Full App and Google Sheet Coverage Audit

**Audit date:** August 12, 2026  
**Scope:** Event Director workflow, Bowler Portal, roster import, Google Sheets write-back, claim codes, QR access, offline door tools, and current master-sheet column coverage.

## Verification Summary

The complete automated suite passed: **17 test files and 152 tests**. The production client bundle also completed successfully. Visual checks confirmed the public home page, Event Director login, and Bowler Portal entry page render without client build errors.

| Area | Result | Notes |
|---|---|---|
| Roster import | Passed | A 450-row real-roster regression import completed with 0 import errors. |
| Bowler ID generation | Passed | The audit corrected a 26-column insert / 25-placeholder defect that could prevent new bowlers from being saved. |
| Claim codes | Passed | Import-time generation, BL write-back, reissue, Sheet Sync, and duplicate-name resolution are covered. |
| Google Sheets QR write-back | Passed | IDs, primary QR passes, guest QR passes, and claim codes use precise roster matching. |
| Offline door tools | Passed | Offline scanner generation and sync tests passed. |
| Bowler Portal | Passed | T-shirt pickup, second squad fields, disabled pool-party suppression, passports, and entry page render paths were checked. |
| Event Director portal | Passed | Login, roster, import, claims, PDFs, payout, and staff-related test paths passed. |

## Master Sheet Column Contract

| Columns | App treatment | Coverage |
|---|---|---|
| A–C | Bowler ID, phone, email | Imported and/or written back; surfaced in ED and Bowler Portal workflows. |
| D–Y | Bowling, team, hotel, T-shirt, primary and second squad details | Imported. Event Director roster can edit operational fields; Bowler Portal shows relevant personal/event details. |
| Z–AO | Primary and guest Pool/Banquet QR links plus used markers | Generated and written by the app; QR/passport visibility respects event eligibility. |
| AP–BI | Survey questions and answers | Questions read from the sheet; answers written by the app. |
| BJ | Guest Name | Imported as Guest A. Creates named banquet access and eligible pool access. |
| BK | Additional Guest Name | Imported as Guest B. Creates named banquet access and eligible pool access. |
| BL | Claim Code | Generated uniquely by the app at the end of every import and written back. |
| BM | Bill Breakdown | Written by payout workflow. |
| BN | Team Score | Written by payout workflow. |
| BO | Event Ranking | Written by payout workflow. |
| BP | Payout Amount | Written by payout workflow. |

## Audit Fixes Applied

> **Critical protection:** BJ and BK are now reserved for the two guest names. Payout ranking and payout amount were moved to BO and BP so no payout action can overwrite guest names.

The audit corrected the following verified issues:

1. The roster import insert had one fewer SQL placeholder than values. This could block new-bowler inserts. The corrected real-roster import test now passes.
2. The legacy Sheet Sync export range ended at BI. It now reads through BP so guest names, claim codes, and payout columns are retained.
3. Same-name bowlers at the same center could be blocked by a claim code belonging to the second roster record. Claim-code sign-up now uses the code's bowler ID to select the exact matching roster record.
4. The `Coordinator` sheet column was mapped but not persisted. It is now stored with the team and appears in Bowler Portal Event Details after the next import.
5. T-shirt size and pickup location are shown together when T-shirts are enabled. Pool Party information and guest pool passes are completely hidden when the event disables the pool party.

## Current Event Data Check

For the current **Group 3 test** event, the database contains 792 bowlers. Of those, 790 have an imported T-shirt size, all 792 have a Bowler ID and banquet passport token, and the event is configured with pool party disabled. The current source data has no populated second-squad or second-lane values, so there is no additional squad card to display until a source row includes those values.

## Intentional App-Only Data

The following are intentionally retained only in the application database and are not written into the master sheet: password hashes, active login/session tokens, raw QR security tokens, internal audit logs, failed login attempts, notification history, and offline device sync records. The sheet receives safe operational outputs such as QR URLs, claim codes, used markers, survey responses, and payout results.

## Operator Actions

1. Re-import any active tab once to populate the new Coordinator field for existing teams.
2. Add `BO Event Ranking` and `BP Payout Amount` headers when you begin using payout write-back; the app will also stamp them automatically when the payout workflow runs.
3. Keep BJ–BN intact on every event tab: **Guest Name**, **Additional Guest Name**, **Claim Code**, **Bill Breakdown**, and **Team Score**.

## Remaining Validation Recommendation

Automated tests cannot complete a real authenticated Bowler Portal claim without consuming a real one-time claim code. Before the event, conduct one controlled manual test with a newly generated code: enter the bowler's name, center, code, password, and confirm the portal displays the correct team, T-shirt, hotel, squad, and eligible passports.
