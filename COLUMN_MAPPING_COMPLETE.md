# Complete Google Sheets Column Mapping

**Status:** Comprehensive mapping of all 60+ columns identified  
**Unmapped Columns:** 12 columns need to be added to googleSheets.ts

---

## All Columns by Type

### Orange (App Writes) - 9 columns
- A (0) = Bowler ID (app-managed)
- B (1) = Phone
- C (2) = Email
- Z (25) = 2nd Banquet QR (app-managed)
- AB (27) = Banquet QR (app-managed)
- AD (29) = Pool QR (app-managed)
- AF (31) = #A Pool QR (app-managed)
- AH (33) = #B Pool QR (app-managed)
- AJ (35) = #A Banquet QR (app-managed)

### Purple (App Reads) - 18 columns
- D (3) = Squad Day & Time → squadTime
- E (4) = Lane # → laneNumber
- F (5) = Center → centerName
- G (6) = Team # → teamCode
- H (7) = Captain → isCapitain
- I (8) = First Name → firstName
- J (9) = Last Name → lastName
- K (10) = Under 21? → under21
- L (11) = Sanction # → sanctionNumber
- M (12) = # Games → numGames
- N (13) = Best Avg → bestAvg
- O (14) = Team Name → teamName
- P (15) = League Member → leagueMember
- Q (16) = T-Shirt Size → shirtSize
- R (17) = Hotel Confirmation → hotelConfirmation
- S (18) = Check In → hotelCheckin
- T (19) = Check Out → hotelCheckout
- U (20) = Roommate First Name → roommateFirst
- V (21) = Roommate Last Name → roommateLast
- W (22) = Hotel Registration # (already mapped)
- X (23) = Coordinator ⚠ **UNMAPPED**
- AK (36) = 2nd Squad Time ⚠ **UNMAPPED**
- AL (37) = 2nd Lane # ⚠ **UNMAPPED**

### White (Doorman Writes) - 10 columns
- Y (24) = Pool Used ⚠ **UNMAPPED**
- AA (26) = 2nd Banquet Used ⚠ **UNMAPPED**
- AC (28) = Banquet Used (app-managed)
- AE (30) = Pool party entry confirmed
- AG (32) = #A Pool Used ⚠ **UNMAPPED**
- AI (34) = #B Pool Used ⚠ **UNMAPPED**
- AM (38) = 2nd Pool Used ⚠ **UNMAPPED**
- AN (39) = 2nd Banquet Used ⚠ **UNMAPPED**

### Survey Questions (Red-Pink) - 10 columns
- AQ (42) = Q1 Overall Experience? ⚠ **UNMAPPED**
- AS (44) = Q2 Bowling Venue? ⚠ **UNMAPPED**
- AU (46) = Q3 Event Organization? ⚠ **UNMAPPED**
- AW (48) = Q4 Pool Party? (If applicable) ⚠ **UNMAPPED**
- AY (50) = Q5 Banquet Experience? ⚠ **UNMAPPED**
- BA (52) = Q6 This App? ⚠ **UNMAPPED**
- BC (54) = Q7 League App Interest? ⚠ **UNMAPPED**
- BE (56) = Q8 Additional Comments or Concerns ⚠ **UNMAPPED**
- BG (58) = Q9 Testimonial Permission? ⚠ **UNMAPPED**
- BI (60) = Q10 Attend Next Year? ⚠ **UNMAPPED**

### Survey Answers (Red-Pink) - 10 columns
- AR (43) = Q1 Answer ⚠ **UNMAPPED**
- AT (45) = Q2 Answer ⚠ **UNMAPPED**
- AV (47) = Q3 Answer ⚠ **UNMAPPED**
- AX (49) = Q4 Answer ⚠ **UNMAPPED**
- AZ (51) = Q5 Answer ⚠ **UNMAPPED**
- BB (53) = Q6 Answer ⚠ **UNMAPPED**
- BD (55) = Q7 Answer ⚠ **UNMAPPED**
- BF (57) = Q8 Answer ⚠ **UNMAPPED**
- BH (59) = Q9 Answer ⚠ **UNMAPPED**
- BJ (61) = Q10 Answer ⚠ **UNMAPPED**

---

## Summary of Unmapped Columns

**Total Unmapped: 12 columns**

| Column | Index | Name | Type | Priority |
|--------|-------|------|------|----------|
| X | 23 | Coordinator | Purple (Read) | Medium |
| Y | 24 | Pool Used | White (Doorman) | High |
| AA | 26 | 2nd Banquet Used | White (Doorman) | High |
| AG | 32 | #A Pool Used | White (Doorman) | High |
| AI | 34 | #B Pool Used | White (Doorman) | High |
| AK | 36 | 2nd Squad Time | Purple (Read) | Low |
| AL | 37 | 2nd Lane # | Purple (Read) | Low |
| AM | 38 | 2nd Pool Used | White (Doorman) | High |
| AN | 39 | 2nd Banquet Used | White (Doorman) | High |
| AQ | 42 | Q1 Overall Experience? | Survey Question | Medium |
| AS | 44 | Q2 Bowling Venue? | Survey Question | Medium |
| AU | 46 | Q3 Event Organization? | Survey Question | Medium |
| AW | 48 | Q4 Pool Party? | Survey Question | Medium |
| AY | 50 | Q5 Banquet Experience? | Survey Question | Medium |
| BA | 52 | Q6 This App? | Survey Question | Medium |
| BC | 54 | Q7 League App Interest? | Survey Question | Medium |
| BE | 56 | Q8 Additional Comments? | Survey Question | Medium |
| BG | 58 | Q9 Testimonial Permission? | Survey Question | Medium |
| BI | 60 | Q10 Attend Next Year? | Survey Question | Medium |
| AR | 43 | Q1 Answer | Survey Answer | Medium |
| AT | 45 | Q2 Answer | Survey Answer | Medium |
| AV | 47 | Q3 Answer | Survey Answer | Medium |
| AX | 49 | Q4 Answer | Survey Answer | Medium |
| AZ | 51 | Q5 Answer | Survey Answer | Medium |
| BB | 53 | Q6 Answer | Survey Answer | Medium |
| BD | 55 | Q7 Answer | Survey Answer | Medium |
| BF | 57 | Q8 Answer | Survey Answer | Medium |
| BH | 59 | Q9 Answer | Survey Answer | Medium |
| BJ | 61 | Q10 Answer | Survey Answer | Medium |

---

## Next Steps

1. **Add High Priority Unmapped Columns:**
   - Pool Used (Y)
   - 2nd Banquet Used (AA)
   - #A Pool Used (AG)
   - #B Pool Used (AI)
   - 2nd Pool Used (AM)
   - 2nd Banquet Used (AN)

2. **Add Survey Columns:**
   - All 10 survey question columns (AQ, AS, AU, AW, AY, BA, BC, BE, BG, BI)
   - All 10 survey answer columns (AR, AT, AV, AX, AZ, BB, BD, BF, BH, BJ)

3. **Add Medium Priority Columns:**
   - Coordinator (X)
   - All survey question/answer columns

4. **Add Low Priority Columns:**
   - 2nd Squad Time (AK)
   - 2nd Lane # (AL)

---

## Implementation Plan

Update `server/googleSheets.ts`:

1. Add all missing column constants
2. Update DEFINITIVE COLUMN LAYOUT documentation
3. Add all constants to SHEET_COLS export
4. Update suppress-warnings list
5. Run tests to verify no breaking changes
6. Commit and push to GitHub
