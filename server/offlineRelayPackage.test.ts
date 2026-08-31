import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildOfflineRelayGuide, buildOfflineRelayScript } from "./offlineRelayPackage";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRelay(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:8787/health");
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(80);
  }
  throw lastError ?? new Error("The local relay did not start.");
}

describe("offline Raspberry Pi incident relay package", () => {
  it("keeps scanner events Pi-local and protects the laptop monitor with an access code", () => {
    const script = buildOfflineRelayScript();
    expect(script).toContain("ThreadingHTTPServer");
    expect(script).toContain('path != "/api/incidents"');
    expect(script).toContain("if not is_local(self)");
    expect(script).toContain('path == "/monitor"');
    expect(script).toContain("monitor access code required");
    expect(script).toContain("text/event-stream");
  });

  it("provides the offline private-network sequence without requiring internet", () => {
    const guide = buildOfflineRelayGuide();
    expect(guide).toContain("nmcli device wifi hotspot");
    expect(guide).toContain("No internet");
    expect(guide).toContain("Laptop monitor");
    expect(guide).toContain("final sync");
  });

  it("generates Python that can run on a standard Raspberry Pi OS installation", async () => {
    const folder = await mkdtemp(join(tmpdir(), "bowl-vegas-relay-"));
    const path = join(folder, "bowl-vegas-local-relay.py");
    await writeFile(path, buildOfflineRelayScript(), "utf8");
    await expect(execFileAsync("python3", ["-m", "py_compile", path])).resolves.toMatchObject({ stderr: "" });
  });

  it("accepts non-blocking local scan events and requires the monitor access code", async () => {
    const folder = await mkdtemp(join(tmpdir(), "bowl-vegas-live-relay-"));
    const path = join(folder, "bowl-vegas-local-relay.py");
    await writeFile(path, buildOfflineRelayScript(), "utf8");
    const child = spawn("python3", [path], { cwd: folder, stdio: "ignore" });
    try {
      await waitForRelay();
      const sourceResponse = await fetch("http://127.0.0.1:8787/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: 1980003,
          mode: "banquet",
          lane: 1,
          scannedAtMs: Date.now(),
          result: "denied_used",
          admit: false,
          headline: "ALREADY IN",
          detail: "Test bowler — already scanned",
          displayName: "Test Bowler",
          teamNumber: "17",
        }),
      });
      expect(sourceResponse.status).toBe(200);
      expect(await fetch("http://127.0.0.1:8787/monitor")).toHaveProperty("status", 403);
      const key = (await readFile(join(folder, "monitor-access-code.txt"), "utf8")).trim();
      const monitor = await fetch(`http://127.0.0.1:8787/monitor?key=${encodeURIComponent(key)}`);
      expect(monitor.status).toBe(200);
      await expect(monitor.text()).resolves.toContain("Offline Event Director Monitor");
      const stream = await fetch(`http://127.0.0.1:8787/events?key=${encodeURIComponent(key)}`);
      expect(stream.status).toBe(200);
      const reader = stream.body?.getReader();
      const firstChunk = await reader?.read();
      const firstEvent = new TextDecoder().decode(firstChunk?.value);
      expect(firstEvent).toContain("denied_used");
      await reader?.cancel();
    } finally {
      child.kill("SIGTERM");
    }
  });
});
