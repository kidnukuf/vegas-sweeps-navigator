import { describe, expect, it } from "vitest";
import { createEventDirectorWorkspacePath } from "./ownerNavigation";

describe("createEventDirectorWorkspacePath", () => {
  it("opens the Event Director workspace with the selected event context", () => {
    expect(createEventDirectorWorkspacePath(1980003)).toBe("/ed?eventId=1980003");
  });

  it("keeps the selected event context when opening a specific remediation tab", () => {
    expect(createEventDirectorWorkspacePath(1980003, "passports")).toBe("/ed?eventId=1980003&focus=passports");
  });

  it("rejects a missing or invalid event context", () => {
    expect(() => createEventDirectorWorkspacePath(0)).toThrow("valid event ID");
  });
});
