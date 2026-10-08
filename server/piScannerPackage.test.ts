import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildPiScannerZip } from "./piScannerPackage";

const execFileAsync = promisify(execFile);

const input = {
  scannerFilename: "VSN-OfflineScanner-Event1980003-Banquet-2026-10-08.html",
  scannerHtml: "<!doctype html><title>Scanner</title><script>const MODE='banquet';</script>",
  relayScript: "#!/usr/bin/env python3\nprint('relay')\n",
  relayGuide: "# Relay Guide\nUse the local monitor.\n",
};

describe("Raspberry Pi scanner ZIP package", () => {
  it("creates a readable ZIP with a localhost launcher and all required files", async () => {
    const folder = await mkdtemp(join(tmpdir(), "bowl-vegas-pi-package-"));
    const zipPath = join(folder, "scanner.zip");
    await writeFile(zipPath, buildPiScannerZip(input));

    const listing = await execFileAsync("unzip", ["-Z1", zipPath]);
    expect(listing.stdout.split("\n").filter(Boolean)).toEqual([
      input.scannerFilename,
      "bowl-vegas-local-relay.py",
      "START_PI_SCANNER.sh",
      "PI_SCANNER_README.md",
    ]);

    const extractDir = join(folder, "extracted");
    await execFileAsync("unzip", ["-q", zipPath, "-d", extractDir]);
    await expect(execFileAsync("sh", ["-n", join(extractDir, "START_PI_SCANNER.sh")])).resolves.toMatchObject({ stderr: "" });
    const launcher = await readFile(join(extractDir, "START_PI_SCANNER.sh"), "utf8");
    const guide = await readFile(join(extractDir, "PI_SCANNER_README.md"), "utf8");
    expect(launcher).toContain("http://localhost:8787/scanner/");
    expect(launcher).toContain("bowl-vegas-local-relay.py");
    expect(guide).toContain("serves the scanner locally instead of opening the downloaded HTML as a raw file");
    expect(guide).toContain("Android Chrome can still open the standalone HTML directly");
  });
});
