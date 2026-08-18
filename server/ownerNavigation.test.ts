import { describe, expect, it } from "vitest";
import { createEventDirectorWorkspacePath } from "../client/src/lib/ownerNavigation";

describe("owner Event Director launcher", () => {
  it("passes the selected event ID into the Event Director workspace URL", () => {
    expect(createEventDirectorWorkspacePath(1980003)).toBe("/ed?eventId=1980003");
  });

  it("does not generate a workspace URL without a valid event ID", () => {
    expect(() => createEventDirectorWorkspacePath(-1)).toThrow("valid event ID");
  });
});
