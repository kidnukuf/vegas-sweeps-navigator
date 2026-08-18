import { describe, expect, it } from "vitest";
import { createEventDirectorWorkspacePath } from "./ownerNavigation";

describe("createEventDirectorWorkspacePath", () => {
  it("opens the Event Director workspace with the selected event context", () => {
    expect(createEventDirectorWorkspacePath(1980003)).toBe("/ed?eventId=1980003");
  });

  it("rejects a missing or invalid event context", () => {
    expect(() => createEventDirectorWorkspacePath(0)).toThrow("valid event ID");
  });
});
