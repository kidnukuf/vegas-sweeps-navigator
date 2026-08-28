import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { rawExec, rawQuery } from "../db";
import { assertEventAccess } from "../_core/edAuth";
import { COORDINATOR_COOKIE, requireCoordinatorSession, resolveCoordinatorSession, signCoordinatorCookie } from "../_core/coordinatorAuth";

const cleanEmail = (email: string) => email.trim().toLowerCase();
const code = () => `CO-${crypto.randomBytes(6).toString("base64url").toUpperCase()}`;
const inviteInput = z.object({ eventId: z.number().int().positive(), centerId: z.number().int().positive().optional(), leagueSessions: z.array(z.string().trim().min(1).max(100)).max(20).default([]), recipientName: z.string().trim().max(255).optional(), recipientEmail: z.string().email().optional() });

export const coordinatorRouter = router({
  access: publicProcedure.query(async ({ ctx }) => resolveCoordinatorSession(ctx)),
  invitations: router({
    list: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      return rawQuery(`SELECT i.id, i.eventId, i.centerId, i.leagueSessions, i.recipientName, i.recipientEmail, i.expiresAt, i.redeemedAt, i.revokedAt, i.createdAt, bc.centerName FROM coordinator_invitations i LEFT JOIN bowling_centers bc ON bc.id = i.centerId WHERE i.eventId = ? ORDER BY i.createdAt DESC`, [input.eventId]);
    }),
    create: publicProcedure.input(inviteInput).mutation(async ({ input, ctx }) => {
      const ed = await assertEventAccess(ctx, input.eventId);
      if (input.centerId) {
        const center = await rawQuery<{ id: number }>(`SELECT id FROM bowling_centers WHERE id = ? LIMIT 1`, [input.centerId]);
        if (!center[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a recognized bowling center." });
      }
      const rawCode = code(); const id = uuidv4();
      await rawExec(`INSERT INTO coordinator_invitations (id, eventId, centerId, leagueSessions, recipientName, recipientEmail, codeHash, expiresAt, createdByStaffId) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR), ?)`, [id, input.eventId, input.centerId ?? null, JSON.stringify(input.leagueSessions), input.recipientName?.trim() || null, input.recipientEmail ? cleanEmail(input.recipientEmail) : null, await bcrypt.hash(rawCode, 12), ed.staffId ?? null]);
      return { id, code: rawCode, expiresInHours: 72 };
    }),
    revoke: publicProcedure.input(z.object({ invitationId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const rows = await rawQuery<{ eventId: number; redeemedAt: Date | null }>(`SELECT eventId, redeemedAt FROM coordinator_invitations WHERE id = ? LIMIT 1`, [input.invitationId]);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      await assertEventAccess(ctx, rows[0].eventId);
      if (rows[0].redeemedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "A redeemed invitation cannot be revoked." });
      await rawExec(`UPDATE coordinator_invitations SET revokedAt = NOW() WHERE id = ? AND redeemedAt IS NULL`, [input.invitationId]);
      return { ok: true };
    }),
  }),
  redeem: publicProcedure.input(z.object({ code: z.string().trim().min(6).max(64), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().email(), password: z.string().min(8).max(128), centerPhone: z.string().trim().min(7).max(32), centerExtension: z.string().trim().min(1).max(20), mobilePhone: z.string().trim().max(32).optional(), preferredContactMethod: z.string().trim().max(32).optional() })).mutation(async ({ input, ctx }) => {
    const invites = await rawQuery<{ id: string; eventId: number; centerId: number | null; leagueSessions: unknown; codeHash: string }>(`SELECT id, eventId, centerId, leagueSessions, codeHash FROM coordinator_invitations WHERE redeemedAt IS NULL AND revokedAt IS NULL AND expiresAt > NOW() ORDER BY createdAt DESC`);
    const invite = (await Promise.all(invites.map(async (value) => ({ value, matched: await bcrypt.compare(input.code.toUpperCase(), value.codeHash) })))).find((row) => row.matched)?.value;
    if (!invite) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation is invalid, expired, or already used." });
    const email = cleanEmail(input.email);
    if ((await rawQuery<{ id: number }>(`SELECT id FROM coordinator_accounts WHERE email = ? LIMIT 1`, [email]))[0]) throw new TRPCError({ code: "CONFLICT", message: "A coordinator account already uses this email." });
    const account = await rawExec(`INSERT INTO coordinator_accounts (email, passwordHash, firstName, lastName, centerPhone, centerExtension, mobilePhone, preferredContactMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [email, await bcrypt.hash(input.password, 12), input.firstName.trim(), input.lastName.trim(), input.centerPhone.trim(), input.centerExtension.trim(), input.mobilePhone?.trim() || null, input.preferredContactMethod?.trim() || null]);
    await rawExec(`INSERT INTO coordinator_scopes (coordinatorAccountId, invitationId, eventId, centerId, leagueSessions) VALUES (?, ?, ?, ?, ?)`, [account.insertId, invite.id, invite.eventId, invite.centerId, JSON.stringify(invite.leagueSessions ?? [])]);
    await rawExec(`UPDATE coordinator_invitations SET redeemedAt = NOW() WHERE id = ? AND redeemedAt IS NULL`, [invite.id]);
    (ctx as any).res?.cookie(COORDINATOR_COOKIE, signCoordinatorCookie(account.insertId), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 * 1000 });
    return { ok: true, coordinatorId: account.insertId, eventId: invite.eventId };
  }),
  login: publicProcedure.input(z.object({ email: z.string().email(), password: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const rows = await rawQuery<{ id: number; passwordHash: string }>(`SELECT id, passwordHash FROM coordinator_accounts WHERE email = ? AND isActive = 1 LIMIT 1`, [cleanEmail(input.email)]);
    if (!rows[0] || !(await bcrypt.compare(input.password, rows[0].passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
    await rawExec(`UPDATE coordinator_accounts SET lastLoginAt = NOW() WHERE id = ?`, [rows[0].id]);
    (ctx as any).res?.cookie(COORDINATOR_COOKIE, signCoordinatorCookie(rows[0].id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 * 1000 });
    return { ok: true };
  }),
  logout: publicProcedure.mutation(({ ctx }) => { (ctx as any).res?.clearCookie(COORDINATOR_COOKIE, { path: "/" }); return { ok: true }; }),
  myScopes: publicProcedure.query(async ({ ctx }) => {
    const coordinator = await requireCoordinatorSession(ctx);
    return rawQuery(`SELECT s.*, e.eventName, e.eventYear, bc.centerName FROM coordinator_scopes s JOIN events e ON e.id = s.eventId LEFT JOIN bowling_centers bc ON bc.id = s.centerId WHERE s.coordinatorAccountId = ? ORDER BY s.id DESC`, [coordinator.id]);
  }),
  submissions: router({
    listMine: publicProcedure.query(async ({ ctx }) => {
      const coordinator = await requireCoordinatorSession(ctx);
      return rawQuery(`SELECT s.*, e.eventName, bc.centerName, COUNT(b.id) AS rowCount FROM coordinator_submissions s JOIN events e ON e.id = s.eventId LEFT JOIN bowling_centers bc ON bc.id = s.centerId LEFT JOIN coordinator_bowlers b ON b.submissionId = s.id WHERE s.coordinatorAccountId = ? GROUP BY s.id, e.eventName, bc.centerName ORDER BY s.updatedAt DESC`, [coordinator.id]);
    }),
    saveDraft: publicProcedure.input(z.object({ scopeId: z.number().int().positive(), submissionId: z.string().uuid().optional(), leagueSession: z.string().trim().max(100).optional(), sourceType: z.enum(["web_form", "xlsx", "csv"]), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2_000) })).mutation(async ({ input, ctx }) => {
      const coordinator = await requireCoordinatorSession(ctx);
      const scopes = await rawQuery<{ eventId: number; centerId: number | null; leagueSessions: unknown }>(`SELECT eventId, centerId, leagueSessions FROM coordinator_scopes WHERE id = ? AND coordinatorAccountId = ? LIMIT 1`, [input.scopeId, coordinator.id]);
      const scope = scopes[0]; if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "This coordinator scope is unavailable." });
      const id = input.submissionId ?? uuidv4();
      const existing = await rawQuery<{ id: string }>(`SELECT id FROM coordinator_submissions WHERE id = ? AND coordinatorAccountId = ? LIMIT 1`, [id, coordinator.id]);
      if (input.submissionId && !existing[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot edit this submission." });
      if (!existing[0]) await rawExec(`INSERT INTO coordinator_submissions (id, eventId, centerId, coordinatorAccountId, leagueSession, sourceType, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`, [id, scope.eventId, scope.centerId, coordinator.id, input.leagueSession?.trim() || null, input.sourceType]);
      else await rawExec(`UPDATE coordinator_submissions SET leagueSession = ?, sourceType = ? WHERE id = ?`, [input.leagueSession?.trim() || null, input.sourceType, id]);
      await rawExec(`DELETE FROM coordinator_bowlers WHERE submissionId = ?`, [id]);
      for (let index = 0; index < input.rows.length; index++) await rawExec(`INSERT INTO coordinator_bowlers (id, submissionId, sourceRowNumber, data, validationStatus) VALUES (?, ?, ?, ?, 'draft')`, [uuidv4(), id, index + 1, JSON.stringify(input.rows[index])]);
      await rawExec(`INSERT INTO coordinator_audit_log (id, eventId, submissionId, actorType, actorId, action, newValue) VALUES (?, ?, ?, 'coordinator', ?, 'draft_saved', ?)`, [uuidv4(), scope.eventId, id, String(coordinator.id), String(input.rows.length)]);
      return { ok: true, submissionId: id, rowCount: input.rows.length };
    }),
    listForEvent: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      return rawQuery(`SELECT s.*, a.firstName, a.lastName, a.email, a.centerPhone, a.centerExtension, a.mobilePhone, a.preferredContactMethod, bc.centerName, COUNT(b.id) AS rowCount FROM coordinator_submissions s JOIN coordinator_accounts a ON a.id = s.coordinatorAccountId LEFT JOIN bowling_centers bc ON bc.id = s.centerId LEFT JOIN coordinator_bowlers b ON b.submissionId = s.id WHERE s.eventId = ? GROUP BY s.id, a.firstName, a.lastName, a.email, a.centerPhone, a.centerExtension, a.mobilePhone, a.preferredContactMethod, bc.centerName ORDER BY s.updatedAt DESC`, [input.eventId]);
    }),
    markReadyForInitialImport: publicProcedure.input(z.object({ submissionId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const rows = await rawQuery<{ eventId: number }>(`SELECT eventId FROM coordinator_submissions WHERE id = ? LIMIT 1`, [input.submissionId]);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found." });
      await assertEventAccess(ctx, rows[0].eventId);
      await rawExec(`UPDATE coordinator_submissions SET status = 'ready_for_owner_initial_import', readyForInitialImportAt = NOW(), edReviewedAt = NOW() WHERE id = ?`, [input.submissionId]);
      return { ok: true };
    }),
  }),
});
