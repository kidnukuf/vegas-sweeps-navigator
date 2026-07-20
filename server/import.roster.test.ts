import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Minimal CSV parser matching the client's behavior (handles quoted fields)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(current); current = ""; }
      else if (ch === "\n") { row.push(current); rows.push(row); row = []; current = ""; }
      else if (ch === "\r") { /* skip */ }
      else current += ch;
    }
  }
  if (current.length > 0 || row.length > 0) { row.push(current); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("import.process — real roster CSV", () => {
  it("imports the full roster with no 'Center not found' errors", async () => {
    const csv = readFileSync(join(__dirname, "__fixtures_roster.csv"), "utf8");
    const grid = parseCSV(csv);
    const headers = grid[0];
    const dataRows = grid.slice(1);

    // Build raw rows keyed by original headers (mirrors the client's payload)
    const rows = dataRows.map(cells => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
      return obj;
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.import.process({
      rows,
      sourceType: "csv",
      sourceName: "test roster",
      eventId: 1,
    });

    const r = result as { imported: number; updated: number; errors: number; errorDetails: { error: string }[] };
    const centerNotFound = (r.errorDetails || []).filter(e => String(e.error).includes("Center not found"));

    // Log a summary for visibility
    // eslint-disable-next-line no-console
    console.log(`imported=${r.imported} updated=${r.updated} errors=${r.errors} centerNotFound=${centerNotFound.length}`);
    // eslint-disable-next-line no-console
    console.log("SAMPLE ERRORS:", JSON.stringify((r.errorDetails || []).slice(0, 5), null, 2));

    expect(centerNotFound.length).toBe(0);
    expect(r.imported + r.updated).toBeGreaterThan(440);
  }, 300000);
});
