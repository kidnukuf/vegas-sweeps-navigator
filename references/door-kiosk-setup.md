# Offline Door Scanner — Event-Day Setup Guide

This is the single-laptop, fully-offline door check-in system for the **Banquet** and the
**Pool Party**. It is designed for venues with bad or no Wi‑Fi: you load the data once while
you still have a signal, then everything runs on the laptop with zero internet. Every scan is
saved locally and uploads automatically the moment a connection comes back.

The page lives at: **`/offline-door`**

---

## What you need

- **1 laptop** (the brain — runs everything)
- **2 TVs or external monitors** (one per doorman, ~20 ft apart in the same hallway)
- **2 USB barcode/QR scanners** (one per TV — the cheap "keyboard wedge" kind)
- Cables to connect both TVs to the laptop (HDMI + a USB‑C→HDMI adapter, or a USB‑C dual‑HDMI hub)

> **Important — why 2 scan windows, not 4:** A web browser can't tell which USB scanner
> typed a code (they all act like one keyboard). So each scanner gets its **own browser
> window** on its **own TV**. One scanner → one window → one TV. You can still split duties
> between two doormen exactly as planned; you just run two scan windows instead of four.

---

## One-time setup the day before (while you HAVE internet)

1. On the laptop, open the site and log in as you normally would.
2. Go to **`/offline-door`**. You'll land on the **Console**.
3. Click **Load Banquet Data** (or **Load Pool Party Data** depending on which event is first).
   - You'll see a toast: "Loaded N passes + 200 re-entry codes."
   - This downloads the full guest list and the re-entry pool into the laptop's storage.
4. Set an **Override PIN** (4–8 digits) in the Setup box. You'll need it to force-admit anyone.
5. Leave the laptop. The data is now saved on it even if you close the lid or lose Wi‑Fi.

> Switching events later (Banquet → Pool Party) is one click: just press the other
> **Load … Data** button when you have a signal again. Same laptop, same scanners.

---

## Event-day physical setup (15 minutes)

1. Plug both TVs into the laptop. In the OS display settings choose **"Extend"** (not Mirror),
   so the laptop screen + 2 TVs are three separate displays.
2. Plug both USB scanners into the laptop (a powered USB hub is fine).
3. Open the site at **`/offline-door`** in **two browser windows**:
   - **Window 1:** click **Open Door A (TV 1)**, drag it onto the left TV, press **F11** to go fullscreen.
   - **Window 2:** click **Open Door B (TV 2)**, drag it onto the right TV, press **F11**.
4. Keep the **Console** open on the **laptop's own screen** (a third window/tab).
5. On each TV window, pick that door's **re-entry zone** (N / E / S / W) using the small buttons.
6. Test one known-good code at each TV — you should see a big green **WELCOME**.

That's it. You can now unplug from Wi‑Fi entirely and the door keeps working.

---

## How scanning works

- Doorman scans a guest's QR/barcode. The TV flashes:
  - **GREEN "WELCOME"** + beep → let them in.
  - **RED** + buzzer → do **not** argue at the door. Politely say **"please step aside"** and
    wave the next guest forward so the line keeps moving.
- A code that's already been used (on **either** TV) will always show **"ALREADY IN"** — the two
  TVs share the same memory, so nobody can sneak in twice by switching lines.

### Red flashes mean one of:
| Banner | Meaning | What to do |
|---|---|---|
| **ALREADY IN** | Pass already scanned | Step aside → resolve at laptop |
| **NOT FOUND** | Code isn't on the list | Step aside → resolve at laptop |
| **WRONG DOOR** | Re-entry code from a different zone | Send them to their original door |

---

## Resolving a "step aside" guest (at the laptop Console)

1. Go to the laptop's **Console** window → **Step-Aside Resolution**.
2. Search the guest by **name, team #, or team name**.
3. The Console shows their status (valid / already-scanned) using the offline data.
4. Decide:
   - **Override-Admit:** enter the **Override PIN**, optionally tick *Flag for Event Director*,
     then click **Override-Admit**. The guest is let in and the override is logged.
   - **Flag only:** logs the issue for the Event Director without admitting.

Everything here works offline. Overrides and flags upload automatically later.

---

## Re-entry passes (guests leaving and coming back)

1. On the laptop Console → **Re-entry Passes**.
2. Pick the **Zone** (the door they'll come back through: N/E/S/W).
3. Type the guest's **wristband number** and click **Issue Re-entry**.
4. Hand them the matching re-entry code/card. It is **reusable** and **locked to that zone** —
   if they try a different door it shows **WRONG DOOR**.
5. When they don't need it anymore, paste the code into **Release** to return it to the pool.

There are **50 codes per zone (200 total)**, reusable across the whole event and future events.

---

## Connection + syncing (automatic)

- The Console header shows **Online / Offline / Syncing** and an **"N unsynced"** badge.
- While offline, every scan, override, flag, and re-entry is saved on the laptop.
- The moment the laptop gets internet again, it **auto-uploads** everything:
  - marks passes used in the database,
  - writes the check-in timestamp back to the Google Sheet,
  - clears the "unsynced" badge.
- You can also press **Sync Now** any time you have a signal.
- Re-sending is safe — the server ignores duplicates, so nothing is ever double-counted.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| A TV window froze | Press **← Console**, then re-open that Door window. Data is safe. |
| Browser/laptop crashed | Reopen `/offline-door`. All scans are restored from local storage. |
| Scanner typing into wrong window | Click once inside the correct TV window to give it focus. |
| "No data loaded" on a TV | Go to Console and press **Load … Data** (needs internet once). |
| Badge stuck on "unsynced" | You're offline — it'll clear automatically when internet returns, or press **Sync Now**. |

---

## Quick reference

- **Page:** `/offline-door`
- **Default door zones:** Door A = N, Door B = E (change per event with the N/E/S/W buttons)
- **Re-entry pool:** 50 per zone × 4 = 200 reusable codes
- **Override:** PIN-protected, logged, optional ED flag
- **Sync:** automatic on reconnect + manual **Sync Now**; duplicates are ignored
