import { describe, expect, it } from "vitest";
import { resolveGoogleCredentialStatus } from "./googleCredsLogic";

describe("resolveGoogleCredentialStatus", () => {
  it("recognizes the deployment-level shared service account when no in-app credential exists", () => {
    expect(resolveGoogleCredentialStatus(null, JSON.stringify({ client_email: "shared@test.iam.gserviceaccount.com" }))).toEqual({
      saved: true,
      clientEmail: "shared@test.iam.gserviceaccount.com",
    });
  });

  it("uses the in-app credential ahead of the deployment fallback", () => {
    expect(resolveGoogleCredentialStatus(
      JSON.stringify({ client_email: "saved@test.iam.gserviceaccount.com" }),
      JSON.stringify({ client_email: "shared@test.iam.gserviceaccount.com" }),
    )).toEqual({ saved: true, clientEmail: "saved@test.iam.gserviceaccount.com" });
  });
});
