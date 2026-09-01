# November 6 Coordinator Sheet Preflight

## Read-only source inspection

The supplied source workbook is **BOB 2026 ledger MASTER**, with a single visible `Sheet1` worksheet. Its 520 populated roster rows begin after two title/instruction rows and a two-line heading. The core source columns include Center, team number, captain marker, first and last name, gender, under-21 marker, sanction number, historical books, team name, event participation, primary/secondary/tertiary squad selections, return status, check-in and check-out dates, room request, special requests, roommate indicator and name, signature, notes, phone, and email.

## Read-only target inspection

The supplied master workbook’s `November 6 event` tab is selected by `gid=1008714971`. It has the established Bowl Vegas master headers through `Team Score`, and its data area is presently empty. The target tab can therefore receive a reviewed initial roster write without overwriting populated bowler rows.

## Planned mapping boundary

The preview will map supplied source values into existing master fields only. The app-controlled Bowler ID, QR, usage, claim code, billing, score, and survey fields will remain empty. Room-sharing columns will not be added manually during this import; they belong to the separate reviewed Event Director reconciliation workflow.
