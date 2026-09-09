import { describe, expect, it } from "vitest";
import { getOwnerReadinessNavigation, parseEventDirectorAttentionTab, parseOwnerWorkspaceFocus } from "./ownerReadinessNavigation";

describe("Owner readiness navigation", () => {
  it("routes each supported readiness issue to its relevant secure workspace", () => {
    expect(getOwnerReadinessNavigation("Google Sheet target is incomplete")).toMatchObject({ kind: "owner-workspace", focus: "owner-event-settings" });
    expect(getOwnerReadinessNavigation("No Event Director assigned")).toMatchObject({ kind: "owner-workspace", focus: "owner-operations" });
    expect(getOwnerReadinessNavigation("4 missing Bowler IDs")).toMatchObject({ kind: "event-director", tab: "roster" });
    expect(getOwnerReadinessNavigation("2 missing banquet passes")).toMatchObject({ kind: "event-director", tab: "passports" });
    expect(getOwnerReadinessNavigation("1 unmatched bowler")).toMatchObject({ kind: "event-director", tab: "unmatched" });
    expect(getOwnerReadinessNavigation("3 missing claim codes")).toMatchObject({ kind: "event-director", tab: "codes" });
  });

  it("accepts only known Owner focus IDs and Event Director tabs", () => {
    expect(parseOwnerWorkspaceFocus("owner-roster-editor")).toBe("owner-roster-editor");
    expect(parseOwnerWorkspaceFocus("not-a-panel")).toBeUndefined();
    expect(parseEventDirectorAttentionTab("passports")).toBe("passports");
    expect(parseEventDirectorAttentionTab("settings")).toBeUndefined();
  });
});
