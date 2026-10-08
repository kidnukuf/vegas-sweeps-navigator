import { basename } from "node:path";

export type PiScannerPackageInput = {
  scannerFilename: string;
  scannerHtml: string;
  relayScript: string;
  relayGuide: string;
};

type ZipEntry = { name: string; data: Buffer };

/**
 * Builds a small, uncompressed ZIP using only Node buffers. This avoids adding
 * a runtime archive dependency and keeps the downloaded Pi package portable.
 */
export function buildPiScannerZip(input: PiScannerPackageInput): Buffer {
  const scannerName = basename(input.scannerFilename);
  const launcher = buildPiLauncher(scannerName);
  const packageGuide = buildPiPackageGuide(scannerName, input.relayGuide);
  const entries: ZipEntry[] = [
    { name: scannerName, data: Buffer.from(input.scannerHtml, "utf8") },
    { name: "bowl-vegas-local-relay.py", data: Buffer.from(input.relayScript, "utf8") },
    { name: "START_PI_SCANNER.sh", data: Buffer.from(launcher, "utf8") },
    { name: "PI_SCANNER_README.md", data: Buffer.from(packageGuide, "utf8") },
  ];

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, entry.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildPiLauncher(scannerFilename: string): string {
  return `#!/bin/sh
set -eu
BASE_DIR=\"$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\"
SCANNER_DIR=\"$BASE_DIR/scanner\"
SCANNER_FILE=\"$SCANNER_DIR/${scannerFilename}\"
mkdir -p \"$SCANNER_DIR\"
cp \"$BASE_DIR/${scannerFilename}\" \"$SCANNER_FILE\"
printf '\\nBowl Vegas Raspberry Pi scanner\\n'
printf 'Plug in the USB QR scanner before scanning.\\n'
printf 'The scanner page will open from the local relay; do not open the HTML as a raw file.\\n\\n'
python3 \"$BASE_DIR/bowl-vegas-local-relay.py\" &
RELAY_PID=$!
cleanup() { kill \"$RELAY_PID\" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 1
SCANNER_URL=\"http://localhost:8787/scanner/${scannerFilename}\"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open \"$SCANNER_URL\" >/dev/null 2>&1 || true
else
  printf 'Open this address in the Pi browser: %s\\n' \"$SCANNER_URL\"
fi
wait \"$RELAY_PID\"
`;
}

function buildPiPackageGuide(scannerFilename: string, relayGuide: string): string {
  return [
    "# Bowl Vegas Raspberry Pi Scanner Package",
    "",
    "> This package is for Raspberry Pi OS with Chromium and a USB QR scanner that behaves like a keyboard wedge. It serves the scanner locally instead of opening the downloaded HTML as a raw file.",
    "",
    "## Files",
    "",
    `- **${scannerFilename}** — event-scoped offline scanner data and display.`,
    "- **bowl-vegas-local-relay.py** — local Pi relay for the scanner and optional Event Director laptop monitor.",
    "- **START_PI_SCANNER.sh** — one-command launcher.",
    "- **PI_SCANNER_README.md** — this guide.",
    "",
    "## Start on the Raspberry Pi",
    "",
    "1. Extract this ZIP into a folder, such as `~/bowl-vegas-scanner`.",
    "2. Plug the USB QR scanner into the Pi before launching.",
    "3. Open Terminal and run:",
    "",
    "   `cd ~/bowl-vegas-scanner && chmod +x START_PI_SCANNER.sh && ./START_PI_SCANNER.sh`",
    "",
    "4. The launcher starts the local relay and opens the scanner at `http://localhost:8787/scanner/<filename>`.",
    "5. Keep the relay terminal open. The USB scanner types into the global keyboard capture; no mouse click or cursor refocus is required between scans.",
    "6. If the browser does not open automatically, copy the exact `http://localhost:8787/scanner/...` address printed by the launcher into Chromium on the Pi.",
    "",
    "## Optional Event Director laptop monitor",
    "",
    "1. The relay prints a laptop-monitor URL containing a one-time access key.",
    "2. Join the Pi’s private Wi-Fi from the laptop, then open the exact printed monitor URL.",
    "3. The laptop is read-only and must not be used for scanning. The Pi remains the scanner station.",
    "",
    "## Important operating rules",
    "",
    "- Do not double-click the scanner HTML directly on Pi; use `START_PI_SCANNER.sh` so the scanner is served over localhost.",
    "- Test one valid code and one used/invalid code before opening the doors.",
    "- When the event is over, use the scanner’s Scan Log action to download the JSON and import/sync it from the Event Director portal when connectivity returns.",
    "- Android Chrome can still open the standalone HTML directly when a local relay is not needed.",
    "",
    "## Full relay/network reference",
    "",
    relayGuide,
  ].join("\n");
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++) {
    const byte = data[index];
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
