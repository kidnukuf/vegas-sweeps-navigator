/**
 * Tests for the advertiser-lead ("Advertise Here") inquiry router.
 *
 * Verifies, against the live DB with throwaway rows cleaned up afterward:
 *  - submit() inserts a 'new' row and returns { ok: true } (owner-notify is
 *    fire-and-forget and must not affect the result),
 *  - list() filters by status and "all",
 *  - setStatus() updates a lead's status,
 *  - newCount() counts only 'new' leads.
 *
 * Rows are namespaced via a unique company tag and removed in afterAll.
 */
import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { rawQuery } from "./db";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const caller = appRouter.createCaller(createCtx());
const TAG = `ADTEST${Date.now()}`;

type AdRow = {
  id: number;
  name: string;
  company: string | null;
  contact: string;
  message: string;
  slotLabel: string | null;
  status: string;
};

describe("adInquiry router", () => {
  afterAll(async () => {
    await rawQuery("DELETE FROM ad_inquiries WHERE company = ?", [TAG]);
  });

  it("submit() inserts a 'new' lead and returns ok", async () => {
    const res = await caller.adInquiry.submit({
      name: "Jane Advertiser",
      company: TAG,
      contact: "jane@example.com",
      message: "We'd love a banner on the bowler portal.",
      slotLabel: "Bowler Slot 1",
    });
    expect(res.ok).toBe(true);

    const rows = await rawQuery<AdRow>(
      "SELECT id, name, company, contact, message, slotLabel, status FROM ad_inquiries WHERE company = ?",
      [TAG]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Jane Advertiser");
    expect(rows[0].contact).toBe("jane@example.com");
    expect(rows[0].slotLabel).toBe("Bowler Slot 1");
    expect(rows[0].status).toBe("new");
  });

  it("submit() trims and nulls an empty optional company", async () => {
    // company omitted should store NULL, not block insertion.
    const res = await caller.adInquiry.submit({
      name: "No Company Person",
      contact: "555-0100",
      message: "Interested in advertising.",
    });
    expect(res.ok).toBe(true);

    const rows = await rawQuery<AdRow>(
      "SELECT id, company FROM ad_inquiries WHERE name = ? AND contact = '555-0100' ORDER BY id DESC LIMIT 1",
      ["No Company Person"]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].company).toBeNull();
    // Clean up this extra (non-tagged) row immediately.
    await rawQuery("DELETE FROM ad_inquiries WHERE id = ?", [rows[0].id]);
  });

  it("list() returns the tagged lead under 'all' and 'new', not under 'archived'", async () => {
    const all = (await caller.adInquiry.list({ status: "all" })) as AdRow[];
    expect(all.some((r) => r.company === TAG)).toBe(true);

    const news = (await caller.adInquiry.list({ status: "new" })) as AdRow[];
    expect(news.some((r) => r.company === TAG)).toBe(true);

    const archived = (await caller.adInquiry.list({ status: "archived" })) as AdRow[];
    expect(archived.some((r) => r.company === TAG)).toBe(false);
  });

  it("newCount() counts the tagged lead, then drops it after setStatus(read)", async () => {
    const tagged = await rawQuery<AdRow>(
      "SELECT id FROM ad_inquiries WHERE company = ? LIMIT 1",
      [TAG]
    );
    const id = tagged[0].id;

    const before = await caller.adInquiry.newCount();
    expect(before).toBeGreaterThanOrEqual(1);

    const upd = await caller.adInquiry.setStatus({ id, status: "read" });
    expect(upd.ok).toBe(true);

    const row = await rawQuery<AdRow>(
      "SELECT status FROM ad_inquiries WHERE id = ?",
      [id]
    );
    expect(row[0].status).toBe("read");

    // It must no longer appear in the 'new' list.
    const news = (await caller.adInquiry.list({ status: "new" })) as AdRow[];
    expect(news.some((r) => r.id === id)).toBe(false);

    // And it should appear in the 'read' list.
    const read = (await caller.adInquiry.list({ status: "read" })) as AdRow[];
    expect(read.some((r) => r.id === id)).toBe(true);
  });

  it("setStatus() can archive and restore a lead", async () => {
    const tagged = await rawQuery<AdRow>(
      "SELECT id FROM ad_inquiries WHERE company = ? LIMIT 1",
      [TAG]
    );
    const id = tagged[0].id;

    await caller.adInquiry.setStatus({ id, status: "archived" });
    let row = await rawQuery<AdRow>("SELECT status FROM ad_inquiries WHERE id = ?", [id]);
    expect(row[0].status).toBe("archived");

    await caller.adInquiry.setStatus({ id, status: "new" });
    row = await rawQuery<AdRow>("SELECT status FROM ad_inquiries WHERE id = ?", [id]);
    expect(row[0].status).toBe("new");
  });
});
