import { describe, expect, it } from "vitest";
import { getPrimaryDomainRedirect } from "./primaryDomain";

describe("getPrimaryDomainRedirect", () => {
  it("redirects legacy public domains while preserving the complete path and query string", () => {
    expect(getPrimaryDomainRedirect("www.bobrolloffpassport.com", "/owner?event=1980003")).toBe(
      "https://www.bowlvegas.com/owner?event=1980003"
    );
    expect(getPrimaryDomainRedirect("www.funtimeteamchallenge.com", "/ed")).toBe(
      "https://www.bowlvegas.com/ed"
    );
  });

  it("does not redirect the primary domain, localhost, or preview hosts", () => {
    expect(getPrimaryDomainRedirect("www.bowlvegas.com", "/")).toBeNull();
    expect(getPrimaryDomainRedirect("localhost:3000", "/")).toBeNull();
    expect(getPrimaryDomainRedirect("3000-preview.manus.computer", "/")).toBeNull();
  });
});
