import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("Seating Arrangement router registration", () => {
  it("keeps the guarded preview and confirmed BP write-back procedures available", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("seating.banquetRoster");
    expect(procedures).toContain("seating.previewSheetWrite");
    expect(procedures).toContain("seating.syncSheetWrite");
  });
});
