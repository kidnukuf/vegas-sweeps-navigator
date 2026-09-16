import { describe, expect, it } from "vitest";
import { createBanquetQrPacketPdf, type BanquetQrPacketRecord } from "./banquetQrPacketPdf";

function record(index: number): BanquetQrPacketRecord {
  const token = `token-${index}`;
  return {
    bowlerId: index,
    firstName: `First${index}`,
    lastName: `Last${index}`,
    scantronId: `SCAN${index}`,
    banquetToken: token,
    banquetUrl: `https://www.bowlvegas.com/scan/banquet/${token}`,
    banquetUsed: false,
    under21: index === 5,
  };
}

describe("banquet QR packet PDF", () => {
  it("creates one front page and one mirrored back page for every 12 codes", async () => {
    const doc = await createBanquetQrPacketPdf(Array.from({ length: 12 }, (_, index) => record(index + 1)), {
      eventName: "Test for qr",
      eventId: 3390003,
      dateWindow: "2026",
    });
    expect(doc).not.toBeNull();
    expect(doc?.getNumberOfPages()).toBe(2);
  });

  it("adds another duplex sheet when the event has more than 12 codes", async () => {
    const doc = await createBanquetQrPacketPdf(Array.from({ length: 13 }, (_, index) => record(index + 1)), {
      eventName: "Test for qr",
      eventId: 3390003,
    });
    expect(doc?.getNumberOfPages()).toBe(4);
  });
});
