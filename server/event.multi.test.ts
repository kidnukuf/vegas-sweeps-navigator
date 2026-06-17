import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { rawQuery, rawExec } from "./db";

// Minimal public context (these procedures are publicProcedure).
function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

describe("multi-event support", () => {
  it("creates, lists, and renames an event", async () => {
    const caller = appRouter.createCaller(createCtx());
    const unique = `Test Event ${Date.now()}`;

    const created = await caller.event.create({ eventName: unique, eventYear: 2099 });
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
  });

  it("permanently deletes a bowler and audit-logs before removal", async () => {
    const caller = appRouter.createCaller(createCtx());

    // Insert a throwaway bowler scoped to event 1.
    const ins = await rawExec(
      "INSERT INTO bowlers (legalFirstName, legalLastName, eventId, registrationStatus) VALUES (?, ?, 1, 'unmatched')",
      ["DeleteMe", `Test${Date.now()}`]
    );
    const bowlerId = ins.insertId;
    expect(bowlerId).toBeGreaterThan(0);

    const res = await caller.bowlers.delete({ id: bowlerId, actorRole: "EventDirector" });
    expect(res.success).toBe(true);

    // The bowler row must be gone.
    const remaining = await rawQuery("SELECT id FROM bowlers WHERE id = ?", [bowlerId]);
    expect(remaining.length).toBe(0);

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
