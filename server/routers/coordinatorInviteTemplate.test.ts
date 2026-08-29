import { describe, expect, it } from "vitest";
import { buildCoordinatorInvitationEmail, coordinatorSignupUrl } from "./coordinatorInviteTemplate";

describe("coordinator invitation email template", () => {
  it("includes the secure code, 72-hour expiry, sign-in steps, and role boundaries", () => {
    const template = buildCoordinatorInvitationEmail({ code: "CO-EXAMPLE", recipientName: "Jamie", eventName: "Group 3 test", centerName: "Example Lanes", signupUrl: "https://www.bowlvegas.com/coordinator?code=CO-EXAMPLE" });
    expect(template.subject).toContain("Group 3 test");
    expect(template.body).toContain("CO-EXAMPLE");
    expect(template.body).toContain("expires 72 hours");
    expect(template.body).toContain("https://www.bowlvegas.com/coordinator?code=CO-EXAMPLE");
    expect(template.body).toContain("Owner alone performs the initial and final app import");
    expect(template.body).not.toContain("Send this email automatically");
  });

  it("builds the coordinator signup URL without retaining an unrelated path", () => {
    expect(coordinatorSignupUrl("https://www.bowlvegas.com/ed?eventId=4", "CO-TEST")).toBe("https://www.bowlvegas.com/coordinator?code=CO-TEST");
  });
});
