import { describe, expect, it } from "vitest";
import { OFFLINE_SCAN_FEEDBACK, getOfflineFeedbackKind } from "./offlineScannerFeedback";

describe("offline scanner feedback", () => {
  it("distinguishes adult and under-21 accepted scans", () => {
    expect(getOfflineFeedbackKind("admitted", false)).toBe("adult");
    expect(getOfflineFeedbackKind("admitted", true)).toBe("under21");
    expect(OFFLINE_SCAN_FEEDBACK.under21.label).toContain("UNDER 21");
  });

  it("uses the denial feedback for used, invalid, and wrong-door scans", () => {
    expect(getOfflineFeedbackKind("denied_used")).toBe("denied");
    expect(getOfflineFeedbackKind("denied_notfound")).toBe("denied");
    expect(getOfflineFeedbackKind("denied_wrongzone")).toBe("denied");
    expect(OFFLINE_SCAN_FEEDBACK.denied.label).toBe("NO ENTRY");
  });
});
