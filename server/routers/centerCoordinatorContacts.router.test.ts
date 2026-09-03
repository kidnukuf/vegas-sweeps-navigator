import { describe, expect, it } from "vitest";
import { coordinatorRouter } from "./coordinator";

describe("Event Director center coordinator contacts router", () => {
  it("registers the Event Director-only list and save procedures", () => {
    const procedures = (coordinatorRouter as any)._def.procedures;
    expect(procedures["centerContacts.list"]).toBeDefined();
    expect(procedures["centerContacts.save"]).toBeDefined();
  });
});
