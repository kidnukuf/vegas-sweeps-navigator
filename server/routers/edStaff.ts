import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { rawExec, rawQuery } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { assertEventAccess, requirePlatformAdmin, resolveEdSession } from "../_core/edAuth";
import { TRPCError } from "@trpc/server";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
const STAFF_COOKIE = "ed_staff_token";
const SALT_ROUNDS = 12;

function signStaffToken(staffId: number) {
  return jwt.sign({ staffId, type: "ed_staff" }, JWT_SECRET, { expiresIn: "7d" });
}

async function validatePortfolio(companyId: number, eventIds: number[]) {
  if (!eventIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign at least one event to the Event Director." });
  const placeholders = eventIds.map(() => "?").join(",");
  const events = await rawQuery<{ id: number }>(`SELECT id FROM events WHERE companyId = ? AND id IN (${placeholders})`, [companyId, ...eventIds]);
  if (events.length !== eventIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every assigned event must belong to the selected company." });
}

function normalizeSpreadsheetId(value: string) {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = urlMatch?.[1] ?? trimmed;
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid Google Sheet URL or spreadsheet ID." });
  return id;
}

function optionalHttpUrl(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
    return url.toString();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label} must be a valid http(s) URL.` });
  }
}

export const edStaffRouter = router({
  access: publicProcedure.query(async ({ ctx }) => {
    const session = await resolveEdSession(ctx);
    return session ? { type: session.type, companyId: session.companyId ?? null, canManagePlatform: session.type === "owner" || session.type === "platform_admin" } : null;
  }),

  login: publicProcedure
    .input(z.object({ username: z.string().min(1), password: z.string().min(1), rememberMe: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await rawQuery<{ id: number; username: string; passwordHash: string; name: string; companyId: number | null; accessRole: "platform_admin" | "event_director" }>(
        `SELECT id, username, passwordHash, name, companyId, accessRole FROM ed_staff WHERE LOWER(username) = LOWER(?) LIMIT 1`,
        [input.username],
      );
      const staff = rows[0];
      if (!staff || !(await bcrypt.compare(input.password, staff.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      }
      (ctx as any).res?.cookie(STAFF_COOKIE, signStaffToken(staff.id), {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
        maxAge: input.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
      });
      return { staffId: staff.id, name: staff.name, username: staff.username, companyId: staff.companyId, accessRole: staff.accessRole };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const session = await resolveEdSession(ctx);
    if (!session?.staffId) return null;
    const rows = await rawQuery<{ id: number; username: string; name: string; companyId: number | null; accessRole: string }>(
      `SELECT id, username, name, companyId, accessRole FROM ed_staff WHERE id = ? LIMIT 1`, [session.staffId],
    );
    return rows[0] ?? null;
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    (ctx as any).res?.clearCookie(STAFF_COOKIE, { path: "/" });
    return { ok: true };
  }),

  listStaff: publicProcedure.query(async ({ ctx }) => {
    await requirePlatformAdmin(ctx);
    return rawQuery(`SELECT s.id, s.username, s.name, s.companyId, s.accessRole, s.createdAt, c.name AS companyName
      FROM ed_staff s LEFT JOIN companies c ON c.id = s.companyId ORDER BY c.name, s.name`);
  }),

  createStaff: publicProcedure
    .input(z.object({ username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/), password: z.string().min(8), name: z.string().min(1).max(128), companyId: z.number().int().positive(), eventIds: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requirePlatformAdmin(ctx);
      const duplicate = await rawQuery<{ id: number }>(`SELECT id FROM ed_staff WHERE LOWER(username) = LOWER(?) LIMIT 1`, [input.username]);
      if (duplicate[0]) throw new TRPCError({ code: "CONFLICT", message: "That username is already in use." });
      const company = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE id = ? LIMIT 1`, [input.companyId]);
      if (!company[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Company not found." });
      await validatePortfolio(input.companyId, input.eventIds);
      const result = await rawExec(`INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole, createdBy) VALUES (?, ?, ?, ?, 'event_director', ?)`, [input.username, await bcrypt.hash(input.password, SALT_ROUNDS), input.name, input.companyId, ctx.user?.id ?? null]);
      for (const eventId of input.eventIds) await rawExec(`INSERT INTO event_director_assignments (staffId, eventId) VALUES (?, ?)`, [result.insertId, eventId]);
      return { ok: true, staffId: result.insertId };
    }),

  setAssignments: publicProcedure
    .input(z.object({ staffId: z.number().int().positive(), eventIds: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requirePlatformAdmin(ctx);
      const staff = (await rawQuery<{ companyId: number | null; accessRole: string }>(`SELECT companyId, accessRole FROM ed_staff WHERE id = ? LIMIT 1`, [input.staffId]))[0];
      if (!staff?.companyId || staff.accessRole !== "event_director") throw new TRPCError({ code: "BAD_REQUEST", message: "This account is not a company-scoped Event Director." });
      await validatePortfolio(staff.companyId, input.eventIds);
      await rawExec(`DELETE FROM event_director_assignments WHERE staffId = ?`, [input.staffId]);
      for (const eventId of input.eventIds) await rawExec(`INSERT INTO event_director_assignments (staffId, eventId) VALUES (?, ?)`, [input.staffId, eventId]);
      return { ok: true };
    }),

  deleteStaff: publicProcedure.input(z.object({ staffId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    await requirePlatformAdmin(ctx);
    await rawExec(`DELETE FROM event_director_assignments WHERE staffId = ?`, [input.staffId]);
    await rawExec(`DELETE FROM ed_staff WHERE id = ?`, [input.staffId]);
    return { ok: true };
  }),

  resetStaffPassword: publicProcedure.input(z.object({ staffId: z.number().int().positive(), newPassword: z.string().min(8) })).mutation(async ({ input, ctx }) => {
    await requirePlatformAdmin(ctx);
    await rawExec(`UPDATE ed_staff SET passwordHash = ? WHERE id = ?`, [await bcrypt.hash(input.newPassword, SALT_ROUNDS), input.staffId]);
    return { ok: true };
  }),

  workspace: router({
    get: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      const workspace = await rawQuery(`SELECT id, eventName, eventYear, companyId, sheetSpreadsheetId, sheetTabName, sheetTabNickname, sheetTemplateUrl, onboardingGuideUrl, workspaceConfiguredAt
        FROM events WHERE id = ? LIMIT 1`, [input.eventId]);
      if (!workspace[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      const directors = await rawQuery(`SELECT s.id, s.name, s.username FROM ed_staff s
        INNER JOIN event_director_assignments a ON a.staffId = s.id WHERE a.eventId = ? ORDER BY s.name`, [input.eventId]);
      return { ...workspace[0], directors };
    }),

    setup: publicProcedure.input(z.object({
      eventId: z.number().int().positive(),
      spreadsheet: z.string().min(1),
      sheetTabName: z.string().min(1).max(255),
      sheetTabNickname: z.string().max(255).optional(),
      templateUrl: z.string().optional(),
      guideUrl: z.string().optional(),
      staffId: z.number().int().positive().optional(),
    })).mutation(async ({ input, ctx }) => {
      await requirePlatformAdmin(ctx);
      const [event] = await rawQuery<{ id: number; companyId: number | null }>(`SELECT id, companyId FROM events WHERE id = ? LIMIT 1`, [input.eventId]);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      if (!event.companyId) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign this event to a company before creating its workspace." });

      if (input.staffId) {
        const [staff] = await rawQuery<{ id: number; companyId: number | null; accessRole: string }>(`SELECT id, companyId, accessRole FROM ed_staff WHERE id = ? LIMIT 1`, [input.staffId]);
        if (!staff || staff.accessRole !== "event_director" || staff.companyId !== event.companyId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an Event Director from the same company as this event." });
        }
        await rawExec(`INSERT IGNORE INTO event_director_assignments (staffId, eventId) VALUES (?, ?)`, [input.staffId, input.eventId]);
      }

      const spreadsheetId = normalizeSpreadsheetId(input.spreadsheet);
      const templateUrl = optionalHttpUrl(input.templateUrl, "Template URL");
      const guideUrl = optionalHttpUrl(input.guideUrl, "Guide URL");
      await rawExec(`UPDATE events SET sheetSpreadsheetId = ?, sheetTabName = ?, sheetTabNickname = ?, sheetTemplateUrl = ?, onboardingGuideUrl = ?, workspaceConfiguredAt = ?, workspaceConfiguredBy = ? WHERE id = ?`, [
        spreadsheetId, input.sheetTabName.trim(), input.sheetTabNickname?.trim() || null, templateUrl, guideUrl, Date.now(), ctx.user?.id ?? null, input.eventId,
      ]);
      return { ok: true, spreadsheetId, workspaceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
    }),
  }),
});
