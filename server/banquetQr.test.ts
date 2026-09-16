import { describe, expect, it } from "vitest";
import { buildBanquetQrUrl } from "./banquetQr";

describe("banquet QR URL contract", () => {
  it("uses the exact banquet scan route and preserves the live token", () => {
    expect(buildBanquetQrUrl("abc123", "https://www.bowlvegas.com/")).toBe("https://www.bowlvegas.com/scan/banquet/abc123");
  });

  it("encodes tokens safely without changing the route", () => {
    expect(buildBanquetQrUrl("token/with space", "https://bowlvegas.com")).toBe("https://bowlvegas.com/scan/banquet/token%2Fwith%20space");
  });
});
