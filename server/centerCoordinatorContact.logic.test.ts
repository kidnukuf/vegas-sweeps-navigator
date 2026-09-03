import { describe, expect, it } from "vitest";
import { normalizeCenterCoordinatorContact } from "./centerCoordinatorContact.logic";

describe("center coordinator contact normalization", () => {
  it("normalizes center-maintained contact details without changing the coordinator name", () => {
    expect(normalizeCenterCoordinatorContact({
      coordinatorName: "  Lillian Roland ",
      phone: " 559-555-1234 ",
      extension: " 19 ",
      email: " LILLIAN@EXAMPLE.COM ",
      preferredContactMethod: " Email ",
    })).toEqual({
      coordinatorName: "Lillian Roland",
      phone: "559-555-1234",
      extension: "19",
      email: "lillian@example.com",
      preferredContactMethod: "Email",
    });
  });

  it("rejects unsupported preferred-contact labels while retaining valid optional contact fields", () => {
    expect(normalizeCenterCoordinatorContact({ coordinatorName: "Pat Schwalbe", phone: "951-555-0000", preferredContactMethod: "Carrier pigeon" }))
      .toMatchObject({ coordinatorName: "Pat Schwalbe", phone: "951-555-0000", preferredContactMethod: null });
  });
});
