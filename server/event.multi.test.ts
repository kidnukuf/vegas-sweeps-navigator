import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { rawQuery, rawExec } from "./db";
import { ENV } from "./_core/env";

// Platform-owner context for Event Director procedures.
function createCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: ENV.ownerOpenId,
      email: "owner@example.test",
      name: "Test Platform Owner",
      loginMethod: "test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

describe("multi-event support", () => {
  it("creates, lists, and renames an event", async () => {
    const caller = appRouter.createCaller(createCtx());
    const unique = `Test Event ${Date.now()}`;
    const company = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Test Company ${Date.now()}`, `test-company-${Date.now()}`]);

    const created = await caller.event.create({ eventName: unique, eventYear: 2099, companyId: company.insertId });
    expect(created.success).toBe(true);
    expect(created.id).toBeGreaterThan(0);

    const list = await caller.event.list();
    const found = (list as Record<string, unknown>[]).find((e) => Number(e.id) === created.id);
    expect(found).toBeTruthy();
    expect(String(found?.eventName)).toBe(unique);

    const renamed = `${unique} (renamed)`;
    const renameRes = await caller.event.rename({ id: created.id, eventName: renamed, eventYear: 2100 });
    expect(renameRes.success).toBe(true);

    const after = await caller.event.getById({ id: created.id });
    expect(String((after as Record<string, unknown>)?.eventName)).toBe(renamed);
    expect(Number((after as Record<string, unknown>)?.eventYear)).toBe(2100);

    // cleanup
    await rawQuery("DELETE FROM events WHERE id = ?", [created.id]);
    await rawQuery("DELETE FROM companies WHERE id = ?", [company.insertId]);
  });

  it("allows a platform administrator to create an unassigned event when their existing event has no company", async () => {
    const caller = appRouter.createCaller(createCtx());
    const unique = `Unassigned Admin Event ${Date.now()}`;

    const created = await caller.event.create({ eventName: unique, eventYear: 2099 });
    expect(created.success).toBe(true);

    const rows = await rawQuery<{ companyId: number | null }>("SELECT companyId FROM events WHERE id = ?", [created.id]);
    expect(rows[0]?.companyId ?? null).toBeNull();

    await rawQuery("DELETE FROM auditLog WHERE action = 'create_event' AND targetId = ?", [created.id]);
    await rawQuery("DELETE FROM events WHERE id = ?", [created.id]);
  });

  it("permanently deletes a bowler and audit-logs before removal", async () => {
    const caller = appRouter.createCaller(createCtx());
    const scantronId = `9${String(Date.now()).slice(-9)}`;

    // Insert a throwaway bowler scoped to event 1.
    const ins = await rawExec(
      "INSERT INTO bowlers (legalFirstName, legalLastName, scantronId, eventId, registrationStatus) VALUES (?, ?, ?, 1, 'unmatched')",
      ["DeleteMe", `Test${Date.now()}`, scantronId]
    );
    const bowlerId = ins.insertId;
    expect(bowlerId).toBeGreaterThan(0);

    await rawQuery(
      "INSERT INTO guest_bowlers (eventId, bowlerId, guestId, suffix, guestName) VALUES (1, ?, ?, 'A', 'Delete Test Guest')",
      [bowlerId, `${scantronId}A`]
    );
    await rawQuery(
      "INSERT INTO contact_requests (eventId, bowlerId, phone, email, status) VALUES (1, ?, '5555555555', 'delete-test@example.com', 'pending')",
      [bowlerId]
    );

    const res = await caller.bowlers.delete({ id: bowlerId, actorRole: "EventDirector" });
    expect(res.success).toBe(true);

    // The bowler row must be gone.
    const remaining = await rawQuery("SELECT id FROM bowlers WHERE id = ?", [bowlerId]);
    expect(remaining.length).toBe(0);

    const guestRows = await rawQuery("SELECT id FROM guest_bowlers WHERE bowlerId = ?", [bowlerId]);
    const contactRows = await rawQuery("SELECT id FROM contact_requests WHERE bowlerId = ?", [bowlerId]);
    expect(guestRows.length).toBe(0);
    expect(contactRows.length).toBe(0);

    // An audit row recording the deletion must exist.
    const audit = await rawQuery(
      "SELECT * FROM auditLog WHERE action = 'delete_bowler' AND targetId = ? ORDER BY id DESC LIMIT 1",
      [bowlerId]
    );
    expect(audit.length).toBe(1);
    expect(String((audit[0] as Record<string, unknown>).details)).toContain("PERMANENTLY DELETED");

    // cleanup audit row
    await rawQuery("DELETE FROM auditLog WHERE action = 'delete_bowler' AND targetId = ?", [bowlerId]);
  });
});
