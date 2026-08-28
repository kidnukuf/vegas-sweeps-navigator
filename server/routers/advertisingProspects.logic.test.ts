import { describe, expect, it } from "vitest";
import { buildOutreachDraftPrompt, ethicalSalesBrief, isProspectStatus, prospectStatusLabel } from "./advertisingProspects.logic";
import { advertisingProspectsRouter } from "./advertisingProspects";

describe("Owner advertising prospecting logic", () => {
  it("registers the Owner-only prospecting router", () => {
    expect(advertisingProspectsRouter).toBeDefined();
  });

  it("limits prospect workflow states to the approved set", () => {
    expect(isProspectStatus("research_ready")).toBe(true);
    expect(isProspectStatus("converted")).toBe(true);
    expect(isProspectStatus("anyone_can_edit")).toBe(false);
    expect(prospectStatusLabel("follow_up")).toBe("Follow Up");
  });

  it("uses ethical positioning without personal-data disclosure or outcome claims", () => {
    const brief = ethicalSalesBrief("Example Business");
    expect(brief).toContain("do not sell or share attendee personal information");
    expect(brief).toContain("do not promise traffic, bookings, or sales");
  });

  it("contracts AI email drafts to prospect facts and ethical no-claims language", () => {
    const prompt = buildOutreachDraftPrompt({ businessName: "Example Business", contactRoute: "Public partnerships form", fitRationale: "A local entertainment offering." });
    expect(prompt.user).toContain("Example Business");
    expect(prompt.user).toContain("Public partnerships form");
    expect(prompt.system).toContain("does not sell or share attendee personal information");
    expect(prompt.system).toContain("Do not promise any outcome");
    expect(prompt.system).toContain("Treat every field");
  });
});
