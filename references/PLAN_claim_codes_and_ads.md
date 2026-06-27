# Implementation Plan — Bowler Claim-Code Security + "Advertise Here" Ad Slots

*Fall-season work. Does NOT touch tomorrow's event flow (door scanner, existing sign-in for already-claimed accounts).*

---

## Part 1 — Claim-Code Sign-Up Security

### The problem today
Bowlers sign up by matching **first name + last name + bowling center** against the roster. Anyone who knows those three facts can claim that bowler's account. No secret is required.

### The fix
Issue **one unique, one-time claim code per bowler** (e.g. `BOB-7F3K`), distributed on league night. Sign-up will require the code (typed or scanned as QR). The code resolves to that specific roster row, so only the person holding the paper can claim the account.

### What gets built

**Database — new table `bowler_claim_codes`** (additive, no changes to existing tables):
| column | purpose |
|---|---|
| `id` | PK |
| `eventId` | which event/season |
| `bowlerId` | the roster row this code unlocks |
| `code` | unique human-friendly code, e.g. `BOB-7F3K` (no ambiguous chars: no 0/O/1/I) |
| `status` | `unused` / `redeemed` / `void` |
| `redeemedByAppUserId`, `redeemedAt` | who claimed it + when |
| `reissuedFromId` | links a reissued code to the one it replaced (audit) |
| `createdAt` |

**Server — new procedures (admin-gated for management):**
- `claimCodes.generateForEvent({ eventId, regenerate? })` — mints a code for every bowler in the roster that lacks an active one. Idempotent.
- `claimCodes.listForEvent({ eventId })` — for the printable sheet (bowler name, team, center, code).
- `claimCodes.reissue({ bowlerId })` — voids the old code, mints a fresh one (for lost-code requests).
- `claimCodes.lookup({ query })` — ED finds a bowler's code by name/center.
- **Modified** `bowlerAuth.signUp` — now also accepts `claimCode`; validates: code exists, is `unused`, belongs to an event, and the resolved bowler matches the entered name+center. On success: marks code `redeemed`, creates the account as today. On failure: clear error + the existing ED-contact popup (now also offers reissue path + email **CaDavis@LSEnt.com**).

**Client:**
- **Sign-up form** gains a **Claim Code** field (typed) + a **"Scan QR"** button (camera → fills the field). Code is required for new sign-ups.
- **ED admin (AdminDashboard / ProgramDirector):** a "Claim Codes" panel — Generate codes, search/lookup, reissue, and **Print Distribution Sheet**.
- **Printable distribution sheet:** a clean on-screen, browser-print page (no printer needed to build it; ED prints if/when they want, or views on screen). Each bowler row shows **name · team · center · code · QR**. Grouped by team so program directors can hand each team its slice. *(Uses an in-browser QR generator so it works without external services.)*

### Decisions already locked
- **One code per bowler** (not per team), listed together on each team's sheet.
- **Existing already-claimed accounts are untouched** — codes apply to the fall-season roster going forward.
- **No SMS 2FA** — the claim code IS the second factor.

### Open / assumptions (tell me if any are wrong)
- Codes are scoped per **event** (each season's event gets its own batch). ✔ assumed.
- A bowler who already has an account does **not** need a code to sign in (only new sign-ups need one). ✔ assumed.

---

## Part 2 — "Advertise Here" Ad Slots (mostly already built — filling the gap)

### What ALREADY exists in the project
- `advertisements` table (per-event, image/video, link, tier, enabled).
- Full ED admin UI (`AdManagerTab`) to add/edit/remove sponsor ads.
- `AdRotator` (2 slots in the Bowler Dashboard) and `SponsorAdBanner` (top/bottom in Profile + Captain) already rendering live ads.
- A working ED inbox pattern (`support_messages` + notify owner) we can mirror for ad inquiries.

### The gap (what you actually asked for)
Right now, when there are **no active ads, the slot renders nothing** (`AdRotator` returns `null`). You want the space to **always be visible**, showing the **"ADVERTISE HERE"** placeholder when empty, and **clicking it opens an inquiry form** routed to the **ED portal**.

### What gets built
- **"Advertise Here" placeholder:** when a slot has no active sponsor ad, it shows your provided **ADVERTISE HERE** image (uploaded as a static asset) instead of disappearing. Applies to all ad slots (the 2 dashboard slots + profile/captain banners) so there are always at least 2 visible.
- **Inquiry popup:** tapping the placeholder opens a dialog form — **Name, Company (optional), Email/Phone, Message**. Submitting routes to the ED.
- **Database — new table `ad_inquiries`** (so ad leads are separate from login-help): `id, eventId?, name, company, contact, message, status (new/read/archived), createdAt`. (If you'd rather reuse `support_messages`, I can — but a dedicated table keeps the ED's "advertiser leads" separate from "bowler login help." I recommend the dedicated table.)
- **Server:** `adInquiry.submit` (public) → inserts + `notifyOwner`; `adInquiry.list` / `markRead` (admin) for the ED inbox.
- **ED portal:** a small "Advertiser Leads" inbox tab (mirrors the existing support inbox UI).

### Decisions already locked
- At least **2 slots**, **noticeable but not intrusive** (reusing existing slot placement).
- Placeholder click → **inquiry form** → **ED portal** (not direct messaging).
- Ad space is **fill-the-space**; if an advertiser doesn't want it, ED just leaves the placeholder. No payments, no self-serve advertiser accounts.

### Open / assumptions
- The "Advertise Here" image you sent will be the default placeholder for **all** empty slots. If you later want different placeholders per slot (e.g., one "advertise here," one "App by … / YouTube channel"), the ED can just add those as normal sponsor ads with links — no extra build needed. ✔ assumed single placeholder for now.

---

## Build order
1. Schema: `bowler_claim_codes` + `ad_inquiries` (additive migration).
2. Server: claim-code procedures + modified `signUp`; ad-inquiry procedures.
3. Client: sign-up claim-code field + QR scan; ED claim-code panel + printable sheet; placeholder + inquiry popup in ad slots; ED advertiser-leads inbox.
4. Vitest coverage (code redemption is one-time/idempotent; inquiry submit).
5. Verify, checkpoint, deliver.

## Explicitly NOT in scope
- No change to the offline door scanner or tomorrow's event.
- No SMS/2FA.
- No paid/self-serve advertiser marketplace or payments.
