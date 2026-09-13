# Bowl Vegas Raspberry Pi Offline Scanner Runbook

## Purpose and operating model

This runbook describes the current supported setup for a Raspberry Pi that scans banquet or pool-party QR passes without internet access while an Event Director laptop receives scan outcomes in real time over a private Wi-Fi network created by the Pi.

The **Raspberry Pi performs the scanning**. The laptop is a separate, read-only monitoring screen. The laptop must never be used as the scanner input station, and nobody should click into the Pi scanner page between scans.

> **Important:** The laptop monitor receives scan outcomes only while the local relay is running and the laptop is connected to the Pi’s private Wi-Fi. The Pi continues scanning if the laptop disconnects. The scanner’s local scan log remains the authoritative fallback and must be downloaded before the relay or browser is closed.

## What must be prepared

| Item | Required state |
|---|---|
| Raspberry Pi | Raspberry Pi OS with Chromium, Python 3, built-in Wi-Fi, and USB QR scanner support |
| Event Director laptop | Any current browser and Wi-Fi capability |
| Scanner HTML | A freshly downloaded file for the selected event and station mode |
| Relay script | `bowl-vegas-local-relay.py`, downloaded from the same Event Director Portal export menu |
| USB drive | Recommended for moving both files to the Pi before the event |
| QR test materials | One known valid Test for qr pass and one deliberately invalid or already-used test pass |

## Part 1 — Download the correct files

### 1. Select the event first

On a computer with internet access, sign in to the Event Director Portal. Select the intended event from the event selector. For the current QR test, select:

> **Test for qr — Event ID 3390003**

Do not download the scanner before selecting the event. The selected event is embedded in the generated HTML file.

### 2. Download the station-specific scanner

Open the Event Director Portal’s export or scanner menu and choose exactly one of the following:

- **Download Banquet Scanner (Pi / Android)** for banquet entry.
- **Download Pool Party Scanner (Pi / Android)** for pool-party entry.

The downloaded file should have a name similar to:

```text
VSN-OfflineScanner-Event3390003-Banquet-YYYY-MM-DD.html
```

For a pool-party scanner, the filename will contain `PoolParty` instead of `Banquet`.

The filename must contain the correct event number. If it does not contain `Event3390003`, stop and download again after selecting **Test for qr**.

### 3. Download the relay package

From the same scanner/export menu, choose **Download Pi Live Monitor Relay**. This downloads:

```text
bowl-vegas-local-relay.py
BOWL_VEGAS_PI_LAPTOP_LIVE_MONITOR_SETUP.md
```

The relay script and the scanner HTML should be downloaded during the same preparation session. The setup guide is useful as a reference, but this runbook is the current consolidated procedure.

## Part 2 — Prepare the Raspberry Pi folder

### 4. Copy the files to the Pi

Copy the scanner HTML and `bowl-vegas-local-relay.py` from the download location to a USB drive. Move the USB drive to the Raspberry Pi.

Open the Pi’s file manager and create this folder structure in your home directory:

```text
/home/pi/bowl-vegas-relay/
/home/pi/bowl-vegas-relay/scanner/
```

Copy the files into these locations:

```text
/home/pi/bowl-vegas-relay/bowl-vegas-local-relay.py
/home/pi/bowl-vegas-relay/scanner/VSN-OfflineScanner-Event3390003-Banquet-YYYY-MM-DD.html
```

The actual scanner filename may contain the date. Do not rename it unless necessary; the relay accepts any `.html` file inside the `scanner` folder.

### 5. Confirm the files in Terminal

Open Terminal on the Pi and run:

```bash
cd ~/bowl-vegas-relay
ls -l
ls -l scanner
python3 --version
```

Confirm that the first listing contains `bowl-vegas-local-relay.py`, and the second listing contains the event-specific scanner HTML. Confirm that Python 3 responds with a version number.

## Part 3 — Create the private Pi-to-laptop network

### 6. Identify the Pi Wi-Fi interface

In the Pi Terminal, run:

```bash
nmcli device
```

Find the Wi-Fi interface. It is usually `wlan0`. If the interface has another name, use that name in the next command.

### 7. Create the private Wi-Fi hotspot

Run the following command, replacing the password with a private password of at least eight characters:

```bash
sudo nmcli device wifi hotspot ifname wlan0 ssid "BowlVegas-Offline" password "YOUR-STRONG-PASSWORD"
```

If the interface is not `wlan0`, replace `wlan0` with the interface reported by `nmcli device`.

The network may report **No internet**. That is expected. This network is being used only to carry local scan-monitor traffic between the Pi and laptop.

### 8. Connect the Event Director laptop

On the laptop, open Wi-Fi settings and connect to:

```text
BowlVegas-Offline
```

Enter the hotspot password. Do not connect the laptop to a different Wi-Fi network after this step. The laptop must remain on the Pi’s private network to receive live scan results.

## Part 4 — Start the local relay

### 9. Start the relay in a dedicated Pi Terminal window

On the Pi, run:

```bash
cd ~/bowl-vegas-relay
python3 bowl-vegas-local-relay.py
```

Keep this Terminal window open for the entire test and event. Do not press `Ctrl+C` until scanning is finished.

The relay should print information similar to:

```text
Bowl Vegas local relay is running.
Pi scanner:  http://localhost:8787/scanner/<your-downloaded-scanner-file>.html
Laptop monitor: http://<PI-LOCAL-IP>:8787/monitor?key=<ACCESS-CODE>
The monitor access code is also stored in: .../monitor-access-code.txt
Keep this terminal open during scanning.
```

The actual IP address and access code will be different. Always use the exact monitor URL printed by the Pi. Do not type a guessed address and do not omit the `key=...` portion.

### 10. Check the relay health before opening the scanner

Open a second Terminal window on the Pi and run:

```bash
curl http://127.0.0.1:8787/health
```

A healthy relay returns a response containing:

```json
{"ok": true}
```

If the command fails, do not proceed to scanning. Return to Part 7 and restart the relay.

## Part 5 — Open the full offline scanner on the Pi

### 11. Use the relay URL, not a `file://` URL

The relay must serve the scanner so it can send live incident messages to the laptop. Do **not** double-click the HTML file and do not open it as a `file:///...` URL for the live-monitor setup.

In Chromium on the Raspberry Pi, open the exact `Pi scanner` URL printed by the relay. It will look similar to:

```text
http://localhost:8787/scanner/VSN-OfflineScanner-Event3390003-Banquet-2026-09-13.html
```

Use the actual filename shown in the Pi’s `scanner` folder.

### 12. Verify the scanner header

Before connecting the scanner, confirm all of the following are visible in the scanner page:

| Check | Expected result |
|---|---|
| Event name | `Test for qr` |
| Event ID | `3390003` |
| Station | `Banquet` or `Pool Party`, matching the file downloaded |
| Status | `OFFLINE MODE` is expected; the local relay is still running on the Pi |
| Scanner A | Shows global capture active |
| Total passes | A nonzero count for the selected event and station |

If the page shows another event number, close it immediately and open the correct filename from the `scanner` folder. If the page shows zero passes, the wrong file or wrong station bundle was copied.

### 13. Connect the USB QR scanner

Plug the USB QR scanner into the Pi. Most keyboard-wedge scanners require no driver or application. The scanner types the QR payload as keyboard input and finishes with Enter.

Do not click the scanner input between scans. Scanner A is designed to capture the USB scanner’s keystrokes globally. Keep the scanner page visible and full-screen if desired.

## Part 6 — Open the laptop’s real-time monitor

### 14. Open the exact printed monitor URL

On the Event Director laptop, open a browser and enter the exact `Laptop monitor` URL printed by the Pi relay, for example:

```text
http://192.168.x.x:8787/monitor?key=<ACCESS-CODE>
```

The IP address and access code in this example are placeholders. Use the values printed by your Pi.

The page should show:

```text
Offline Event Director Monitor
Live connection active
```

The monitor is read-only. It cannot scan, consume a QR pass, or change the scanner state.

### 15. Confirm the monitor stream

Leave the laptop monitor open. It displays accepted scans, already-used scans, invalid or not-loaded scans, wrong-station scans, overrides, and ED flags. Use **Show issues only** to filter the feed to problems.

The relay keeps the current in-memory event feed and sends a snapshot when the laptop reconnects. The scanner’s downloaded JSON scan log remains the required end-of-event record.

## Part 7 — Mandatory pre-event test

Perform this test before showing the system to a client.

### 16. Test a known valid pass

Use a known unused banquet QR code from **Test for qr — Event ID 3390003**. Scan it once on the Pi.

Expected results:

| Location | Expected result |
|---|---|
| Pi scanner | Green accepted result with the bowler or guest name |
| Laptop | A new accepted event appears within a few seconds |
| Event identity | The scan log and monitor event show Event ID `3390003` |
| Second scan | The same pass is rejected as already used |

### 17. Test the same pass a second time

Scan the same QR code again. The Pi should show **ALREADY IN** or an equivalent already-used result. The laptop should show a rejected or issue event. This confirms that the scanner is consuming passes locally.

### 18. Test an invalid code

Use a deliberately invalid QR code or manually enter a clearly synthetic value. The Pi should show **QR NOT LOADED**, not a generic wrong-event error. The diagnostic should identify the active bundle as **Test for qr, Event ID 3390003**.

### 19. Test the wrong station deliberately

If a pool-party QR is available, scan it with the Banquet scanner, or scan a banquet QR with the Pool Party scanner. The Pi should show **WRONG STATION** and explain which station the QR belongs to. This is different from an event mismatch and confirms that the station guard is working.

### 20. Test laptop disconnection

Temporarily disconnect the laptop from `BowlVegas-Offline`. Scan one test pass on the Pi. The Pi should continue operating. Reconnect the laptop to the same hotspot and wait for the monitor to reconnect.

If the laptop reconnects but does not show the new event, refresh the monitor URL using the same printed `key=...` address. Do not restart the scanner for a laptop-only network interruption.

## Part 8 — What to do if an error appears

### The Pi says `WRONG EVENT` or shows an unexpected event

1. Stop scanning immediately.
2. Read the scanner page header and confirm the event name and ID.
3. For the QR test, the header must say **Test for qr — Event ID 3390003**.
4. Close the scanner tab.
5. Confirm the correct file exists in `~/bowl-vegas-relay/scanner/`.
6. Reopen the scanner through `http://localhost:8787/scanner/<exact-filename>.html`, not through a file manager double-click.
7. Confirm the header again before scanning.
8. If the problem continues, download a fresh scanner after selecting the event in the Event Director Portal and replace the old HTML file on the Pi.

### The Pi says `QR NOT LOADED`

This means the scanned token is not in the event-and-station bundle currently loaded. Confirm that the QR belongs to **Test for qr — Event ID 3390003**, that the correct Banquet or Pool Party bundle is open, and that the scanner header matches the intended event. Do not disable event scoping to make an unknown QR pass.

### The Pi says `WRONG STATION`

The QR is for the other station type. Open the matching Banquet or Pool Party scanner. Do not use a pool-party QR at the banquet door or a banquet QR at the pool-party door.

### The laptop says it cannot connect

Confirm that the laptop is connected to `BowlVegas-Offline`, not the venue Wi-Fi. Confirm that the relay Terminal is still running on the Pi. Confirm the Pi’s current local IP with:

```bash
hostname -I
```

Then reopen the exact monitor URL printed by the relay, including the access key. Test the relay locally on the Pi with:

```bash
curl http://127.0.0.1:8787/health
```

If local health fails, restart the relay. If local health works but the laptop cannot connect, reconnect both devices to the Pi hotspot and use the newly printed monitor URL.

### The Pi scanner page does not load

Confirm that the relay is running, the file is inside the `scanner` folder, and the URL uses the exact filename. List the folder with:

```bash
ls -l ~/bowl-vegas-relay/scanner
```

The URL must end in `.html`. If the filename contains spaces, use the exact URL copied from the relay output or rename the file to a simple name such as `test-qr-banquet.html`.

### The scanner stops accepting scans

Do not click into a different browser field. Confirm that the scanner is still the active visible page. Unplug and reconnect the USB scanner. If necessary, reload the scanner page through the localhost relay URL. Before reloading after real scans, download the scan log first so the browser session is not interrupted without preserving the record.

### The relay was closed accidentally

Do not continue scanning until the relay is restarted. Restart it with:

```bash
cd ~/bowl-vegas-relay
python3 bowl-vegas-local-relay.py
```

The scanner page may need to be reopened through the new relay URL. The relay’s monitor access code is stored in `monitor-access-code.txt`; the code remains stable for that relay folder unless the file is removed.

## Part 9 — End-of-event procedure

### 21. Download the scanner log before closing anything

On the Pi scanner page, open **Scan Log** and choose **Download JSON**. Save the file to two locations, such as the Pi desktop and a USB drive. Do this before closing Chromium or the relay Terminal.

### 22. Perform final sync when internet is available

When the Pi or another computer has internet access, use the Event Director Portal’s **Upload Offline Scan Log** control. Upload the downloaded JSON file and confirm the selected event is **Test for qr — Event ID 3390003** or the actual event that was scanned.

The upload process is designed to skip duplicate scans. Review the result before closing the event workflow.

### 23. Shut down in the correct order

First download and back up the scanner JSON log. Then close the laptop monitor. Then close the Pi scanner browser. Finally return to the relay Terminal and press `Ctrl+C`.

## Minimum client-facing confidence checklist

Do not present the system to a client until all of these checks are complete:

| Check | Pass condition |
|---|---|
| Correct event | Scanner header says `Test for qr` and `Event ID: 3390003` |
| Correct file path | Scanner opened through `http://localhost:8787/scanner/...` |
| Correct station | Banquet or Pool Party matches the downloaded bundle |
| Valid scan | Pi accepts one known unused pass |
| Duplicate scan | Same pass is rejected on the second attempt |
| Invalid scan | Pi shows `QR NOT LOADED` with the event identity |
| Wrong station | Pi shows `WRONG STATION` when deliberately tested |
| Laptop monitor | Laptop shows `Live connection active` and receives the valid scan |
| Offline behavior | Pi continues scanning after laptop Wi-Fi is temporarily disconnected |
| Recovery | Operator can restart the relay and reopen the exact scanner URL |
| Backup | A downloaded JSON scan log exists before the event begins |

## Current implementation references

| Function | Current source of truth |
|---|---|
| Offline scanner HTML generation | `server/offlineBundleGenerator.ts` |
| Pi relay script and guide generation | `server/offlineRelayPackage.ts` |
| Pi scanner route | `http://localhost:8787/scanner/<filename>.html` |
| Laptop live monitor route | `http://<PI-LOCAL-IP>:8787/monitor?key=<ACCESS-CODE>` |
| Relay health check | `http://127.0.0.1:8787/health` |
| Offline scan-log upload | Event Director Portal → Upload Offline Scan Log |

The relay and scanner workflow was verified with the project’s offline relay regression tests, including Python syntax compilation, local-only scan submission, access-code-protected monitor access, and event-log streaming.
