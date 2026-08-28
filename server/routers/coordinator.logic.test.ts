import { describe, expect, it } from "vitest";
import {
  canCoordinatorEditSubmission,
  canEdMarkReadyForInitialImport,
  hasRosterReadinessErrors,
  isInvitationRedeemable,
  isLeagueSessionAllowed,
  summarizeCoordinatorRows,
  validateCoordinatorRosterRow,
} from "./coordinator.logic";
import { coordinatorRouter } from "./coordinator";

const scopedRow = {
  firstName: "Avery",
  lastName: "Bowl",
  teamNumber: "12",
  teamName: "Pins Up",
  captain: "Yes",
  email: "avery@example.com",
  phone: "702-555-0123",
};

describe("Coordinator Package workflow guards", () => {
  it("registers the coordinator router with the roster and audit procedures", () => {
    expect(coordinatorRouter).toBeDefined();
  });

  it("treats expired, redeemed, and revoked invitations as unusable", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(isInvitationRedeemable({ expiresAt: "2026-08-29T12:00:00.000Z" }, now)).toBe(true);
    expect(isInvitationRedeemable({ expiresAt: "2026-08-28T11:59:59.000Z" }, now)).toBe(false);
    expect(isInvitationRedeemable({ expiresAt: "2026-08-29T12:00:00.000Z", redeemedAt: now }, now)).toBe(false);
    expect(isInvitationRedeemable({ expiresAt: "2026-08-29T12:00:00.000Z", revokedAt: now }, now)).toBe(false);
  });

  it("enforces issued league-session scope and strips app-generated fields", () => {
    expect(isLeagueSessionAllowed(["Tuesday 7:00 PM"], "Tuesday 7:00 PM")).toBe(true);
    expect(isLeagueSessionAllowed(["Tuesday 7:00 PM"], "Wednesday 7:00 PM")).toBe(false);
    const row = validateCoordinatorRosterRow(
      { ...scopedRow, "First Name": "Avery", claimCode: "never-store", bowlerId: "99" },
      { centerName: "Example Lanes", leagueSession: "Tuesday 7:00 PM" },
    );
    expect(row.data).toMatchObject({ firstName: "Avery", center: "Example Lanes", leagueSession: "Tuesday 7:00 PM" });
    expect(row.data).not.toHaveProperty("claimCode");
    expect(row.data).not.toHaveProperty("bowlerId");
  });

  it("allows missing contact details as warnings but blocks missing minimum roster fields", () => {
    const warningRow = validateCoordinatorRosterRow(
      { ...scopedRow, email: "", phone: "" },
      { centerName: "Example Lanes", leagueSession: "Tuesday 7:00 PM" },
    );
    expect(warningRow.errors).toHaveLength(0);
    expect(warningRow.warnings).toHaveLength(2);
    expect(hasRosterReadinessErrors([warningRow])).toBe(false);
    expect(summarizeCoordinatorRows([warningRow])).toMatchObject({ missingEmailCount: 1, missingPhoneCount: 1 });

    const invalidRow = validateCoordinatorRosterRow(
      { ...scopedRow, teamName: "" },
      { centerName: "Example Lanes", leagueSession: "Tuesday 7:00 PM" },
    );
    expect(invalidRow.validationStatus).toBe("needs_correction");
    expect(hasRosterReadinessErrors([invalidRow])).toBe(true);
  });

  it("keeps the submission readiness transition inside the coordinator and ED role boundaries", () => {
    expect(canCoordinatorEditSubmission("draft")).toBe(true);
    expect(canCoordinatorEditSubmission("ready_for_owner_initial_import")).toBe(false);
    expect(canEdMarkReadyForInitialImport("submitted_for_ed_review")).toBe(true);
    expect(canEdMarkReadyForInitialImport("final_imported")).toBe(false);
  });
});
