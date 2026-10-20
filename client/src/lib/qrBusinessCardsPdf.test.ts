import { describe, expect, it } from "vitest";
import { createQrBusinessCardsPdf, type QrBusinessCardRecord } from "./qrBusinessCardsPdf";

function record(index: number): QrBusinessCardRecord {
  return {
    cardId: `card-${index}`,
    bowlerId: index,
    attendeeName: index % 2 ? `Bowler ${index}` : `Guest ${index}`,
    attendeeType: index % 2 ? "bowler" : "guest",
    passType: index % 3 ? "banquet" : "pool",
    qrUrl: `https://www.bowlvegas.com/scan/banquet/token-${index}`,
    under21: index === 2,
    hostName: index % 2 ? null : "Host Bowler",
  };
}

describe("QR business-card PDF", () => {
  it("lays ten standard 3.5 by 2 inch cards on one letter-size page", async () => {
    const doc = await createQrBusinessCardsPdf(Array.from({ length: 10 }, (_, index) => record(index + 1)), {
      eventName: "Bowlers Orleans Bound",
      eventId: 3960003,
    });
    expect(doc).not.toBeNull();
    expect(doc?.getNumberOfPages()).toBe(1);
  });

  it("adds a new page only after the tenth QR business card", async () => {
    const doc = await createQrBusinessCardsPdf(Array.from({ length: 11 }, (_, index) => record(index + 1)), {
      eventName: "Bowlers Orleans Bound",
      eventId: 3960003,
    });
    expect(doc?.getNumberOfPages()).toBe(2);
  });
});
