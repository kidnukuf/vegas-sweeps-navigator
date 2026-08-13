import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { appRouter } from "./routers";
import { rawExec, rawQuery } from "./db";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

function platformOwnerContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: ENV.ownerOpenId,
      email: "owner@example.test",
      name: "Platform Owner",
      loginMethod: "test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function assignedDirectorContext(staffId: number): TrpcContext {
  const token = jwt.sign({ staffId, type: "ed_staff" }, process.env.JWT_SECRET ?? "fallback-secret", { expiresIn: "5m" });
  return {
    user: null,
    req: { protocol: "https", headers: { cookie: `ed_staff_token=${token}` } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Event Director workspace setup", () => {
  it("saves an event sheet, template and guide while assigning a same-company Event Director", async () => {
    const stamp = Date.now();
    const company = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Workspace Company ${stamp}`, `workspace-company-${stamp}`]);
    const event = await rawExec("INSERT INTO events (companyId, eventName, eventYear, status) VALUES (?, ?, ?, 'planning')", [company.insertId, `Workspace Event ${stamp}`, 2099]);
    const staff = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`workspace-director-${stamp}`, "test-hash", "Workspace Director", company.insertId]);

    try {
      const caller = appRouter.createCaller(platformOwnerContext());
      const result = await caller.edStaff.workspace.setup({
        eventId: event.insertId,
        spreadsheet: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
        sheetTabName: "Roster 2099",
        sheetTabNickname: "Main roster",
        templateUrl: "https://docs.google.com/spreadsheets/d/template-2099",
        guideUrl: "https://example.com/event-guide",
        staffId: staff.insertId,
      });

      expect(result.ok).toBe(true);
      expect(result.spreadsheetId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
      const [saved] = await rawQuery<{ sheetSpreadsheetId: string; sheetTabName: string; sheetTemplateUrl: string; onboardingGuideUrl: string }>("SELECT sheetSpreadsheetId, sheetTabName, sheetTemplateUrl, onboardingGuideUrl FROM events WHERE id = ?", [event.insertId]);
      expect(saved).toMatchObject({ sheetSpreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", sheetTabName: "Roster 2099", sheetTemplateUrl: "https://docs.google.com/spreadsheets/d/template-2099", onboardingGuideUrl: "https://example.com/event-guide" });
      const assignments = await rawQuery<{ staffId: number }>("SELECT staffId FROM event_director_assignments WHERE eventId = ? AND staffId = ?", [event.insertId, staff.insertId]);
      expect(assignments).toHaveLength(1);
      const directorWorkspace = await appRouter.createCaller(assignedDirectorContext(staff.insertId)).edStaff.workspace.get({ eventId: event.insertId });
      expect(directorWorkspace).toMatchObject({ sheetSpreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", sheetTabName: "Roster 2099", onboardingGuideUrl: "https://example.com/event-guide" });
    } finally {
      await rawQuery("DELETE FROM event_director_assignments WHERE staffId = ?", [staff.insertId]);
      await rawQuery("DELETE FROM ed_staff WHERE id = ?", [staff.insertId]);
      await rawQuery("DELETE FROM events WHERE id = ?", [event.insertId]);
      await rawQuery("DELETE FROM companies WHERE id = ?", [company.insertId]);
    }
  });
});
