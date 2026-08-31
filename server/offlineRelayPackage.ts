/**
 * Local, no-internet relay used only on the Raspberry Pi during an event.
 * The scanner is served to localhost on the Pi; the Event Director laptop can
 * view a protected, read-only monitor over the Pi's private Wi-Fi hotspot.
 */
export function buildOfflineRelayScript(): string {
  return String.raw`#!/usr/bin/env python3
"""Bowl Vegas local scan relay — no internet required.

Run this on the Raspberry Pi. Place the downloaded scanner HTML file in the
scanner/ folder. Open the scanner on the Pi at http://localhost:8787/scanner/<file>.
Open the printed monitor URL on the Event Director laptop after joining the Pi Wi-Fi.
"""
from __future__ import annotations

import html
import json
import queue
import secrets
import socket
import threading
import time
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent
SCANNER_DIR = BASE_DIR / "scanner"
KEY_FILE = BASE_DIR / "monitor-access-code.txt"
HOST, PORT = "0.0.0.0", 8787
RESULTS = {"admitted", "denied_used", "denied_notfound", "override_admitted", "reentry_admitted", "denied_wrongzone"}

def local_ip() -> str:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))
        return probe.getsockname()[0]
    except OSError:
        return "10.42.0.1"
    finally:
        probe.close()

def monitor_code() -> str:
    if KEY_FILE.exists():
        return KEY_FILE.read_text(encoding="utf-8").strip()
    code = secrets.token_urlsafe(12)
    KEY_FILE.write_text(code + "\n", encoding="utf-8")
    return code

ACCESS_CODE = monitor_code()

class Relay:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.events: deque[dict] = deque(maxlen=750)
        self.listeners: set[queue.Queue] = set()

    def publish(self, event: dict) -> None:
        with self.lock:
            self.events.append(event)
            listeners = list(self.listeners)
        for listener in listeners:
            try:
                listener.put_nowait(event)
            except queue.Full:
                pass

    def snapshot(self) -> list[dict]:
        with self.lock:
            return list(self.events)

    def subscribe(self) -> queue.Queue:
        listener: queue.Queue = queue.Queue(maxsize=200)
        with self.lock:
            self.listeners.add(listener)
        return listener

    def unsubscribe(self, listener: queue.Queue) -> None:
        with self.lock:
            self.listeners.discard(listener)

RELAY = Relay()

def is_local(handler: BaseHTTPRequestHandler) -> bool:
    return handler.client_address[0] in {"127.0.0.1", "::1"}

def monitor_page() -> str:
    return """<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Bowl Vegas — Offline Incident Monitor</title><style>
*{box-sizing:border-box}body{margin:0;background:#07111f;color:#e5edf8;font:16px system-ui,sans-serif}.wrap{max-width:1240px;margin:auto;padding:22px}.status{color:#5eead4;font-weight:700}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.stat,article{background:#0d1b2d;border:1px solid #1f3853;border-radius:12px;padding:14px}.stat b{font-size:28px;display:block}.feed{display:grid;gap:10px}.incident{border-left:4px solid #fb7185}.admit{border-left:4px solid #34d399}.muted{color:#9fb1c6;font-size:13px}.tag{display:inline-block;border-radius:999px;padding:3px 8px;background:#1e3a5f;font-size:11px;font-weight:700;text-transform:uppercase}button{padding:9px 12px;background:#123e5a;border:1px solid #38bdf8;border-radius:8px;color:white;font-weight:700;cursor:pointer}@media(max-width:650px){.stats{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class=\"wrap\"><h1>Offline Event Director Monitor</h1><p class=\"muted\">Private Raspberry Pi network. This page receives scan outcomes in real time without moving scanner focus.</p><p id=\"connection\" class=\"status\">Connecting…</p><div class=\"stats\"><div class=\"stat\"><b id=\"total\">0</b><span>Total scans</span></div><div class=\"stat\"><b id=\"admitted\">0</b><span>Accepted</span></div><div class=\"stat\"><b id=\"issues\">0</b><span>Needs review</span></div><div class=\"stat\"><b id=\"flags\">0</b><span>Overrides / flags</span></div></div><div><button id=\"issuesOnly\">Show issues only</button> <button id=\"allEvents\">Show all scans</button></div><section id=\"feed\" class=\"feed\" style=\"margin-top:16px\"></section></main><script>
var events=[], issuesOnly=false;
function esc(v){var d=document.createElement('div');d.textContent=String(v||'');return d.innerHTML}
function isIssue(e){return !e.admit || e.result==='override_admitted' || e.edFlagged}
function draw(){var shown=issuesOnly?events.filter(isIssue):events;document.getElementById('total').textContent=events.length;document.getElementById('admitted').textContent=events.filter(function(e){return e.admit}).length;document.getElementById('issues').textContent=events.filter(isIssue).length;document.getElementById('flags').textContent=events.filter(function(e){return e.result==='override_admitted'||e.edFlagged}).length;document.getElementById('feed').innerHTML=shown.slice().reverse().map(function(e){return '<article class="'+(isIssue(e)?'incident':'admit')+'"><span class="tag">'+esc(e.result)+'</span><b style="margin-left:8px">'+esc(e.displayName||e.headline)+'</b><div>'+esc(e.detail)+'</div><div class="muted">'+new Date(e.scannedAtMs).toLocaleString()+' · Door '+esc(e.lane||'—')+(e.teamNumber?' · Team '+esc(e.teamNumber):'')+'</div></article>'}).join('')||'<article class="muted">No scan events received yet.</article>'}
function receive(e){events.push(e);if(events.length>750)events.shift();draw()}document.getElementById('issuesOnly').onclick=function(){issuesOnly=true;draw()};document.getElementById('allEvents').onclick=function(){issuesOnly=false;draw()};
var es=new EventSource('/events?key='+encodeURIComponent(new URLSearchParams(location.search).get('key')||''));es.onopen=function(){document.getElementById('connection').textContent='Live connection active'};es.onmessage=function(m){var x=JSON.parse(m.data);if(x.type==='snapshot'){events=x.events||[];draw()}else if(x.type!=='ping'){receive(x)}};es.onerror=function(){document.getElementById('connection').textContent='Waiting to reconnect to the Raspberry Pi…'};
</script></body></html>"""

class Handler(BaseHTTPRequestHandler):
    server_version = "BowlVegasOfflineRelay/1.0"
    def log_message(self, fmt: str, *args) -> None:
        print("[relay] " + (fmt % args))
    def send_json(self, code: int, payload: dict) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(data)
    def valid_key(self, query: dict) -> bool:
        return secrets.compare_digest(query.get("key", [""])[0], ACCESS_CODE)
    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/incidents": self.send_json(HTTPStatus.NOT_FOUND, {"error":"not found"}); return
        if not is_local(self): self.send_json(HTTPStatus.FORBIDDEN, {"error":"scanner events are accepted from the Pi only"}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 4096: raise ValueError("invalid payload size")
            event = json.loads(self.rfile.read(length).decode("utf-8"))
            if event.get("result") not in RESULTS: raise ValueError("invalid scan result")
            event = {key:event.get(key) for key in ("eventId","mode","lane","scannedAtMs","result","admit","headline","detail","displayName","teamNumber","edFlagged")}
            event["scannedAtMs"] = int(event.get("scannedAtMs") or int(time.time()*1000))
            event["admit"] = bool(event.get("admit"))
            RELAY.publish(event); self.send_json(HTTPStatus.OK, {"ok":True})
        except Exception as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error":str(exc)})
    def do_GET(self) -> None:
        parsed, path, query = urlparse(self.path), urlparse(self.path).path, parse_qs(urlparse(self.path).query)
        if path == "/health": self.send_json(HTTPStatus.OK, {"ok":True}); return
        if path == "/monitor":
            if not self.valid_key(query): self.send_json(HTTPStatus.FORBIDDEN, {"error":"monitor access code required"}); return
            page = monitor_page().encode("utf-8"); self.send_response(HTTPStatus.OK); self.send_header("Content-Type","text/html; charset=utf-8"); self.send_header("Content-Length",str(len(page))); self.send_header("Cache-Control","no-store"); self.end_headers(); self.wfile.write(page); return
        if path == "/events":
            if not self.valid_key(query): self.send_json(HTTPStatus.FORBIDDEN, {"error":"monitor access code required"}); return
            listener = RELAY.subscribe()
            try:
                self.send_response(HTTPStatus.OK); self.send_header("Content-Type","text/event-stream"); self.send_header("Cache-Control","no-cache"); self.send_header("Connection","keep-alive"); self.end_headers(); self.wfile.write(("data: "+json.dumps({"type":"snapshot","events":RELAY.snapshot()})+"\n\n").encode()); self.wfile.flush()
                while True:
                    try: event = listener.get(timeout=20); payload = json.dumps(event)
                    except queue.Empty: payload = json.dumps({"type":"ping"})
                    self.wfile.write(("data: "+payload+"\n\n").encode()); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError): pass
            finally: RELAY.unsubscribe(listener)
            return
        if path.startswith("/scanner/"):
            if not is_local(self): self.send_json(HTTPStatus.FORBIDDEN, {"error":"scanner is available on the Raspberry Pi screen only"}); return
            name = unquote(path[len("/scanner/"):])
            target = (SCANNER_DIR / name).resolve()
            if target.suffix.lower() != ".html" or SCANNER_DIR.resolve() not in target.parents or not target.is_file(): self.send_json(HTTPStatus.NOT_FOUND, {"error":"scanner file not found"}); return
            data = target.read_bytes(); self.send_response(HTTPStatus.OK); self.send_header("Content-Type","text/html; charset=utf-8"); self.send_header("Content-Length",str(len(data))); self.send_header("Cache-Control","no-store"); self.end_headers(); self.wfile.write(data); return
        self.send_json(HTTPStatus.NOT_FOUND, {"error":"not found"})

if __name__ == "__main__":
    SCANNER_DIR.mkdir(parents=True, exist_ok=True)
    ip = local_ip()
    print("\nBowl Vegas local relay is running.")
    print("Pi scanner:  http://localhost:8787/scanner/<your-downloaded-scanner-file>.html")
    print("Laptop monitor: http://" + ip + ":8787/monitor?key=" + ACCESS_CODE)
    print("The monitor access code is also stored in: " + str(KEY_FILE))
    print("Keep this terminal open during scanning. Press Ctrl+C only after the event.\n")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
`;
}

export function buildOfflineRelayGuide(): string {
  return [
    "# Bowl Vegas Raspberry Pi Live Incident Monitor",
    "",
    "This guide connects the Raspberry Pi scanner and an Event Director laptop without internet. The QR scanner stays on the Pi. The laptop becomes a separate, read-only live monitor, so no one clicks or moves the scanner cursor during lines.",
    "",
    "## Before the event",
    "",
    "1. In the Event Director portal, use **Exports → Download Banquet Scanner** or **Download Pool Party Scanner**. Download the matching **Raspberry Pi Live Monitor Relay** file as well.",
    "2. Copy the downloaded scanner HTML file and **bowl-vegas-local-relay.py** to a USB drive.",
    "3. On the Raspberry Pi, make a folder named **bowl-vegas-relay**, then place the Python file in that folder. Make a **scanner** folder inside it and copy the scanner HTML into **scanner**.",
    "",
    "## Create the Pi’s private Wi-Fi network",
    "",
    "1. On the Pi, open **Terminal**.",
    "2. Run **nmcli device** and identify the built-in Wi-Fi interface. It is usually **wlan0**.",
    "3. Create the private network, replacing the two placeholders with a name and a password of at least eight characters:",
    "",
    "    sudo nmcli device wifi hotspot ssid \"BowlVegas-Offline\" password \"YOUR-STRONG-PASSWORD\" ifname wlan0",
    "",
    "4. On the Event Director laptop, open Wi-Fi, choose **BowlVegas-Offline**, and enter that password. It may say **No internet**; that is expected.",
    "",
    "## Start the relay and scanner",
    "",
    "1. In Pi Terminal, run:",
    "",
    "    cd ~/bowl-vegas-relay && python3 bowl-vegas-local-relay.py",
    "",
    "2. The terminal prints a **Laptop monitor** address. Copy that exact address—including the **key=...** portion—to the laptop browser. Keep it open on the Event Director laptop.",
    "3. On the Pi, open a browser and enter **http://localhost:8787/scanner/** followed by the exact scanner HTML filename in the scanner folder. Example: **http://localhost:8787/scanner/VSN-OfflineScanner-Event1980003-Banquet-2026-08-30.html**.",
    "4. Put the Pi scanner page full-screen and keep its scanner window focused. Do not use the laptop monitor to scan QR codes.",
    "",
    "## During the event",
    "",
    "- The laptop monitor updates for every accepted, already-used, invalid, wrong-door, override, and flagged scan.",
    "- On the laptop, use **Show issues only** to focus on duplicate or rejected codes. This does not affect the scanner.",
    "- If the local Wi-Fi briefly drops, scanning on the Pi continues. The laptop reconnects to the relay automatically after it rejoins the Pi’s Wi-Fi.",
    "- The private Wi-Fi relay is separate from internet access. When internet returns, use the scanner’s normal final sync procedure to upload the existing scan log.",
    "",
    "## Safety checks",
    "",
    "- Test one known valid code and one already-used/invalid code before opening the doors.",
    "- The scanner page is restricted to the Pi itself. The laptop monitor requires the access code included in the printed address.",
    "- Do not close the terminal that is running the relay until scanning is finished.",
    "",
    "## References",
    "",
    "Raspberry Pi’s official hotspot guide documents the nmcli device wifi hotspot command used above. [1]",
    "",
    "[1]: https://www.raspberrypi.com/tutorials/host-a-hotel-wifi-hotspot/ \"Host a Wi-Fi hotspot with a Raspberry Pi\"",
  ].join("\n");
}
