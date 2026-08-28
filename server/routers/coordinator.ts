import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { rawExec, rawQuery } from "../db";
import { assertEventAccess } from "../_core/edAuth";
import { COORDINATOR_COOKIE, requireCoordinatorSession, resolveCoordinatorSession, signCoordinatorCookie } from "../_core/coordinatorAuth";
import {
  canCoordinatorEditSubmission,
  canEdMarkReadyForInitialImport,
  canEdMarkReadyForFinalImport,
  hasRosterReadinessErrors,
  isInvitationRedeemable,
  isLeagueSessionAllowed,
  isPostInitialImportStatus,
  summarizeCoordinatorRows,
  validateCoordinatorRosterRow,
} from "./coordinator.logic";

const cleanEmail = (email: string) => email.trim().toLowerCase();
const invitationCode = () => `CO-${crypto.randomBytes(6).toString("base64url").toUpperCase()}`;
const actorId = (value: number | undefined) => value ? String(value) : null;
const invitationInput = z.object({
  eventId: z.number().int().positive(),
  centerId: z.number().int().positive(),
  leagueSessions: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  recipientName: z.string().trim().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  replacementForId: z.string().uuid().optional(),
});
const rosterRowsInput = z.array(z.record(z.string(), z.unknown())).min(1).max(2_000);

type CoordinatorScope = { id: number; eventId: number; centerId: number | null; centerName: string | null; leagueSessions: unknown };
type SubmissionRow = { id: string; sourceRowNumber: number; data: Record<string, unknown>; validationStatus: string; validationDetails: unknown };
type SubmissionRecord = { id: string; eventId: number; centerId: number | null; coordinatorAccountId: number; leagueSession: string | null; status: string };

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try { return Array.isArray(JSON.parse(value)) ? JSON.parse(value) : []; } catch { return []; }
}

async function getCoordinatorScope(coordinatorId: number, scopeId: number): Promise<CoordinatorScope> {
  const scopes = await rawQuery<CoordinatorScope>(
    `SELECT s.id, s.eventId, s.centerId, s.leagueSessions, bc.centerName
     FROM coordinator_scopes s LEFT JOIN bowling_centers bc ON bc.id = s.centerId
     WHERE s.id = ? AND s.coordinatorAccountId = ? LIMIT 1`,
    [scopeId, coordinatorId],
  );
  if (!scopes[0]) throw new TRPCError({ code: "FORBIDDEN", message: "This coordinator scope is unavailable." });
  return scopes[0];
}

async function audit({ eventId, submissionId, coordinatorBowlerId, actorType, actorId: auditActorId, action, fieldName, previousValue, newValue }: {
  eventId: number; submissionId?: string | null; coordinatorBowlerId?: string | null; actorType: string; actorId?: string | null; action: string; fieldName?: string | null; previousValue?: string | null; newValue?: string | null;
}) {
  await rawExec(
    `INSERT INTO coordinator_audit_log (id, eventId, submissionId, coordinatorBowlerId, actorType, actorId, action, fieldName, previousValue, newValue)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), eventId, submissionId ?? null, coordinatorBowlerId ?? null, actorType, auditActorId ?? null, action, fieldName ?? null, previousValue ?? null, newValue ?? null],
  );
}

async function replaceSubmissionRows(submissionId: string, validatedRows: ReturnType<typeof validateCoordinatorRosterRow>[]) {
  await rawExec(`DELETE FROM coordinator_bowlers WHERE submissionId = ?`, [submissionId]);
  for (let start = 0; start < validatedRows.length; start += 200) {
    const batch = validatedRows.slice(start, start + 200);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const values: unknown[] = [];
    batch.forEach((row, index) => {
      values.push(uuidv4(), submissionId, start + index + 1, JSON.stringify(row.data), row.validationStatus, JSON.stringify({ errors: row.errors, warnings: row.warnings }));
    });
    await rawExec(
      `INSERT INTO coordinator_bowlers (id, submissionId, sourceRowNumber, data, validationStatus, validationDetails) VALUES ${placeholders}`,
      values,
    );
  }
}

async function getSubmissionRows(submissionId: string): Promise<SubmissionRow[]> {
  const rows = await rawQuery<SubmissionRow>(
    `SELECT id, sourceRowNumber, data, validationStatus, validationDetails FROM coordinator_bowlers WHERE submissionId = ? ORDER BY sourceRowNumber ASC`,
    [submissionId],
  );
  return rows.map((row) => ({ ...row, data: parseJson(row.data) }));
}

function submissionSummary(rows: SubmissionRow[], scope: { centerName: string | null; leagueSession: string | null }) {
  const validated = rows.map((row) => validateCoordinatorRosterRow(parseJson(row.data), scope));
  return { validated, summary: summarizeCoordinatorRows(validated) };
}

async function getEdSubmission(submissionId: string, ctx: Parameters<typeof assertEventAccess>[0]): Promise<SubmissionRecord> {
  const rows = await rawQuery<SubmissionRecord>(
    `SELECT id, eventId, centerId, coordinatorAccountId, leagueSession, status FROM coordinator_submissions WHERE id = ? LIMIT 1`,
    [submissionId],
  );
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Coordinator submission not found." });
  await assertEventAccess(ctx, rows[0].eventId);
  return rows[0];
}

export const coordinatorRouter = router({
  access: publicProcedure.query(async ({ ctx }) => resolveCoordinatorSession(ctx)),
  eventCenters: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    await assertEventAccess(ctx, input.eventId);
    return rawQuery(
      `SELECT bc.id, bc.centerName, MAX(CASE WHEN b.eventId = ? OR l.eventId = ? THEN 1 ELSE 0 END) AS isAlreadyInEvent
       FROM bowling_centers bc
       LEFT JOIN bowlers b ON b.centerId = bc.id AND b.eventId = ?
       LEFT JOIN leagues l ON l.centerId = bc.id AND l.eventId = ?
       GROUP BY bc.id, bc.centerName
       ORDER BY isAlreadyInEvent DESC, bc.centerName ASC`,
      [input.eventId, input.eventId, input.eventId, input.eventId],
    );
  }),
  invitations: router({
    list: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      return rawQuery(
        `SELECT i.id, i.eventId, i.centerId, i.leagueSessions, i.recipientName, i.recipientEmail, i.expiresAt, i.redeemedAt, i.revokedAt, i.createdAt, bc.centerName
         FROM coordinator_invitations i LEFT JOIN bowling_centers bc ON bc.id = i.centerId WHERE i.eventId = ? ORDER BY i.createdAt DESC`,
        [input.eventId],
      );
    }),
    create: publicProcedure.input(invitationInput).mutation(async ({ input, ctx }) => {
      const ed = await assertEventAccess(ctx, input.eventId);
      const center = await rawQuery<{ id: number }>(`SELECT id FROM bowling_centers WHERE id = ? LIMIT 1`, [input.centerId]);
      if (!center[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a recognized bowling center." });
      if (input.replacementForId) {
        const priorInvites = await rawQuery<{ eventId: number }>(`SELECT eventId FROM coordinator_invitations WHERE id = ? LIMIT 1`, [input.replacementForId]);
        if (!priorInvites[0] || priorInvites[0].eventId !== input.eventId) throw new TRPCError({ code: "BAD_REQUEST", message: "A replacement invitation must belong to this event." });
      }
      const rawCode = invitationCode();
      const id = uuidv4();
      await rawExec(
        `INSERT INTO coordinator_invitations (id, eventId, centerId, leagueSessions, recipientName, recipientEmail, codeHash, expiresAt, replacementForId, createdByStaffId)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR), ?, ?)`,
        [id, input.eventId, input.centerId, JSON.stringify(input.leagueSessions), input.recipientName?.trim() || null, input.recipientEmail ? cleanEmail(input.recipientEmail) : null, await bcrypt.hash(rawCode, 12), input.replacementForId ?? null, ed.staffId ?? null],
      );
      return { id, code: rawCode, expiresInHours: 72 };
    }),
    revoke: publicProcedure.input(z.object({ invitationId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const rows = await rawQuery<{ eventId: number; redeemedAt: Date | null }>(`SELECT eventId, redeemedAt FROM coordinator_invitations WHERE id = ? LIMIT 1`, [input.invitationId]);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      await assertEventAccess(ctx, rows[0].eventId);
      if (rows[0].redeemedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "A redeemed invitation cannot be revoked." });
      await rawExec(`UPDATE coordinator_invitations SET revokedAt = NOW() WHERE id = ? AND redeemedAt IS NULL`, [input.invitationId]);
      await audit({ eventId: rows[0].eventId, actorType: "event_director", action: "invitation_revoked", newValue: input.invitationId });
      return { ok: true };
    }),
  }),
  redeem: publicProcedure.input(z.object({ code: z.string().trim().min(6).max(64), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().email(), password: z.string().min(8).max(128), centerPhone: z.string().trim().min(7).max(32), centerExtension: z.string().trim().min(1).max(20), mobilePhone: z.string().trim().max(32).optional(), preferredContactMethod: z.string().trim().max(32).optional() })).mutation(async ({ input, ctx }) => {
    const invites = await rawQuery<{ id: string; eventId: number; centerId: number | null; leagueSessions: unknown; codeHash: string; redeemedAt: Date | null; revokedAt: Date | null; expiresAt: Date }>(
      `SELECT id, eventId, centerId, leagueSessions, codeHash, redeemedAt, revokedAt, expiresAt FROM coordinator_invitations ORDER BY createdAt DESC`,
    );
    const invite = (await Promise.all(invites.map(async (value) => ({ value, matched: isInvitationRedeemable(value) && await bcrypt.compare(input.code.toUpperCase(), value.codeHash) })))).find((row) => row.matched)?.value;
    if (!invite) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation is invalid, expired, revoked, or already used." });
    const email = cleanEmail(input.email);
    if ((await rawQuery<{ id: number }>(`SELECT id FROM coordinator_accounts WHERE email = ? LIMIT 1`, [email]))[0]) throw new TRPCError({ code: "CONFLICT", message: "A coordinator account already uses this email." });
    const account = await rawExec(
      `INSERT INTO coordinator_accounts (email, passwordHash, firstName, lastName, centerPhone, centerExtension, mobilePhone, preferredContactMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, await bcrypt.hash(input.password, 12), input.firstName.trim(), input.lastName.trim(), input.centerPhone.trim(), input.centerExtension.trim(), input.mobilePhone?.trim() || null, input.preferredContactMethod?.trim() || null],
    );
    await rawExec(`INSERT INTO coordinator_scopes (coordinatorAccountId, invitationId, eventId, centerId, leagueSessions) VALUES (?, ?, ?, ?, ?)`, [account.insertId, invite.id, invite.eventId, invite.centerId, JSON.stringify(parseArray(invite.leagueSessions))]);
    await rawExec(`UPDATE coordinator_invitations SET redeemedAt = NOW() WHERE id = ? AND redeemedAt IS NULL`, [invite.id]);
    await audit({ eventId: invite.eventId, actorType: "coordinator", actorId: String(account.insertId), action: "invitation_redeemed", newValue: invite.id });
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
      return rawQuery(
        `SELECT s.*, e.eventName, bc.centerName, COUNT(b.id) AS rowCount,
          SUM(CASE WHEN b.validationStatus = 'ready' THEN 1 ELSE 0 END) AS readyRowCount,
          SUM(CASE WHEN b.validationStatus = 'warning' THEN 1 ELSE 0 END) AS warningRowCount,
          SUM(CASE WHEN b.validationStatus = 'needs_correction' THEN 1 ELSE 0 END) AS errorRowCount
         FROM coordinator_submissions s JOIN events e ON e.id = s.eventId LEFT JOIN bowling_centers bc ON bc.id = s.centerId LEFT JOIN coordinator_bowlers b ON b.submissionId = s.id
         WHERE s.coordinatorAccountId = ? GROUP BY s.id, e.eventName, bc.centerName ORDER BY s.updatedAt DESC`,
        [coordinator.id],
      );
    }),
    getMine: publicProcedure.input(z.object({ submissionId: z.string().uuid() })).query(async ({ input, ctx }) => {
      const coordinator = await requireCoordinatorSession(ctx);
      const submissionRows = await rawQuery<SubmissionRecord & { centerName: string | null }>(
        `SELECT s.id, s.eventId, s.centerId, s.coordinatorAccountId, s.leagueSession, s.status, bc.centerName
         FROM coordinator_submissions s LEFT JOIN bowling_centers bc ON bc.id = s.centerId
         WHERE s.id = ? AND s.coordinatorAccountId = ? LIMIT 1`,
        [input.submissionId, coordinator.id],
      );
      const submission = submissionRows[0];
      if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Coordinator submission not found." });
      const rows = await getSubmissionRows(submission.id);
      const { summary } = submissionSummary(rows, { centerName: submission.centerName, leagueSession: submission.leagueSession });
      const auditRows = await rawQuery(`SELECT * FROM coordinator_audit_log WHERE submissionId = ? ORDER BY createdAt DESC LIMIT 100`, [submission.id]);
      return { submission, rows, summary, audit: auditRows };
    }),
    saveDraft: publicProcedure.input(z.object({ scopeId: z.number().int().positive(), submissionId: z.string().uuid().optional(), leagueSession: z.string().trim().min(1).max(100), sourceType: z.enum(["web_form", "xlsx", "csv"]), rows: rosterRowsInput })).mutation(async ({ input, ctx }) => {
      const coordinator = await requireCoordinatorSession(ctx);
      const scope = await getCoordinatorScope(coordinator.id, input.scopeId);
      if (!isLeagueSessionAllowed(parseArray(scope.leagueSessions), input.leagueSession)) throw new TRPCError({ code: "FORBIDDEN", message: "This league session is outside your assigned coordinator scope." });
      const id = input.submissionId ?? uuidv4();
      const existing = await rawQuery<SubmissionRecord>(`SELECT id, eventId, centerId, coordinatorAccountId, leagueSession, status FROM coordinator_submissions WHERE id = ? AND coordinatorAccountId = ? LIMIT 1`, [id, coordinator.id]);
      if (input.submissionId && !existing[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot edit this submission." });
      if (existing[0] && !canCoordinatorEditSubmission(existing[0].status)) throw new TRPCError({ code: "FORBIDDEN", message: "This submission is in Event Director or Owner review and cannot be edited right now." });
      if (existing[0] && (existing[0].eventId !== scope.eventId || existing[0].centerId !== scope.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "An existing roster must stay within its original coordinator scope." });
      const validatedRows = input.rows.map((row) => validateCoordinatorRosterRow(row, { centerName: scope.centerName, leagueSession: input.leagueSession }));
	      if (!existing[0]) {
	        await rawExec(`INSERT INTO coordinator_submissions (id, eventId, centerId, coordinatorAccountId, leagueSession, sourceType, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`, [id, scope.eventId, scope.centerId, coordinator.id, input.leagueSession.trim(), input.sourceType]);
	      } else {
	        await rawExec(`UPDATE coordinator_submissions SET leagueSession = ?, sourceType = ?, status = ? WHERE id = ?`, [input.leagueSession.trim(), input.sourceType, isPostInitialImportStatus(existing[0].status) ? "draft_after_initial_import" : "draft", id]);
	      }
      await replaceSubmissionRows(id, validatedRows);
      const summary = summarizeCoordinatorRows(validatedRows);
      await audit({ eventId: scope.eventId, submissionId: id, actorType: "coordinator", actorId: String(coordinator.id), action: "draft_saved", newValue: JSON.stringify(summary) });
      return { ok: true, submissionId: id, summary };
    }),
    submitForEdReview: publicProcedure.input(z.object({ submissionId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const coordinator = await requireCoordinatorSession(ctx);
      const submissions = await rawQuery<SubmissionRecord & { centerName: string | null }>(
        `SELECT s.id, s.eventId, s.centerId, s.coordinatorAccountId, s.leagueSession, s.status, bc.centerName
         FROM coordinator_submissions s LEFT JOIN bowling_centers bc ON bc.id = s.centerId WHERE s.id = ? AND s.coordinatorAccountId = ? LIMIT 1`,
        [input.submissionId, coordinator.id],
      );
      const submission = submissions[0];
      if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Coordinator submission not found." });
      if (!canCoordinatorEditSubmission(submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This submission is not available for resubmission." });
	      const rows = await getSubmissionRows(submission.id);
	      const { validated, summary } = submissionSummary(rows, { centerName: submission.centerName, leagueSession: submission.leagueSession });
	      if (hasRosterReadinessErrors(validated)) throw new TRPCError({ code: "BAD_REQUEST", message: "Correct the highlighted minimum roster information and ensure every team has a captain before submitting for review." });
	      const finalReview = isPostInitialImportStatus(submission.status);
	      await rawExec(`UPDATE coordinator_submissions SET status = ?, submittedAt = NOW() WHERE id = ?`, [finalReview ? "submitted_for_final_ed_review" : "submitted_for_ed_review", submission.id]);
	      await audit({ eventId: submission.eventId, submissionId: submission.id, actorType: "coordinator", actorId: String(coordinator.id), action: finalReview ? "submitted_for_final_ed_review" : "submitted_for_ed_review", newValue: JSON.stringify(summary) });
	      return { ok: true, summary, reviewStage: finalReview ? "final" : "initial" };
    }),
    listForEvent: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await assertEventAccess(ctx, input.eventId);
      return rawQuery(
        `SELECT s.*, a.firstName, a.lastName, a.email, a.centerPhone, a.centerExtension, a.mobilePhone, a.preferredContactMethod, bc.centerName, COUNT(b.id) AS rowCount,
          SUM(CASE WHEN b.validationStatus = 'ready' THEN 1 ELSE 0 END) AS readyRowCount,
          SUM(CASE WHEN b.validationStatus = 'warning' THEN 1 ELSE 0 END) AS warningRowCount,
          SUM(CASE WHEN b.validationStatus = 'needs_correction' THEN 1 ELSE 0 END) AS errorRowCount
         FROM coordinator_submissions s JOIN coordinator_accounts a ON a.id = s.coordinatorAccountId LEFT JOIN bowling_centers bc ON bc.id = s.centerId LEFT JOIN coordinator_bowlers b ON b.submissionId = s.id
         WHERE s.eventId = ? GROUP BY s.id, a.firstName, a.lastName, a.email, a.centerPhone, a.centerExtension, a.mobilePhone, a.preferredContactMethod, bc.centerName ORDER BY s.updatedAt DESC`,
        [input.eventId],
      );
    }),
    getForEdReview: publicProcedure.input(z.object({ submissionId: z.string().uuid() })).query(async ({ input, ctx }) => {
      const submission = await getEdSubmission(input.submissionId, ctx);
      const centerRows = submission.centerId ? await rawQuery<{ centerName: string }>(`SELECT centerName FROM bowling_centers WHERE id = ? LIMIT 1`, [submission.centerId]) : [];
      const rows = await getSubmissionRows(submission.id);
      const { summary } = submissionSummary(rows, { centerName: centerRows[0]?.centerName ?? null, leagueSession: submission.leagueSession });
      const auditRows = await rawQuery(
        `SELECT l.*, a.firstName AS coordinatorFirstName, a.lastName AS coordinatorLastName
         FROM coordinator_audit_log l LEFT JOIN coordinator_submissions s ON s.id = l.submissionId
         LEFT JOIN coordinator_accounts a ON a.id = s.coordinatorAccountId
         WHERE l.submissionId = ? ORDER BY l.createdAt DESC LIMIT 200`,
        [submission.id],
      );
      return { submission, rows, summary, audit: auditRows };
    }),
    correctRow: publicProcedure.input(z.object({ submissionId: z.string().uuid(), coordinatorBowlerId: z.string().uuid(), patch: z.record(z.string(), z.unknown()) })).mutation(async ({ input, ctx }) => {
      const submission = await getEdSubmission(input.submissionId, ctx);
      if (["ready_for_owner_initial_import", "ready_for_owner_final_import", "final_imported"].includes(submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This submission is locked for Owner import processing." });
      const centerRows = submission.centerId ? await rawQuery<{ centerName: string }>(`SELECT centerName FROM bowling_centers WHERE id = ? LIMIT 1`, [submission.centerId]) : [];
      const existingRows = await rawQuery<SubmissionRow>(`SELECT id, sourceRowNumber, data, validationStatus, validationDetails FROM coordinator_bowlers WHERE id = ? AND submissionId = ? LIMIT 1`, [input.coordinatorBowlerId, submission.id]);
      const existing = existingRows[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Coordinator roster row not found." });
      const previous = parseJson(existing.data);
      const validated = validateCoordinatorRosterRow({ ...previous, ...input.patch }, { centerName: centerRows[0]?.centerName ?? null, leagueSession: submission.leagueSession });
      await rawExec(`UPDATE coordinator_bowlers SET data = ?, validationStatus = ?, validationDetails = ? WHERE id = ?`, [JSON.stringify(validated.data), validated.validationStatus, JSON.stringify({ errors: validated.errors, warnings: validated.warnings }), existing.id]);
      const changedFields = Object.keys(input.patch).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify((validated.data as Record<string, unknown>)[key]));
      await audit({ eventId: submission.eventId, submissionId: submission.id, coordinatorBowlerId: existing.id, actorType: "event_director", action: "roster_row_corrected", fieldName: changedFields.join(",") || null, previousValue: JSON.stringify(previous), newValue: JSON.stringify(validated.data) });
      return { ok: true, validationStatus: validated.validationStatus };
    }),
    requestCoordinatorFollowUp: publicProcedure.input(z.object({ submissionId: z.string().uuid(), note: z.string().trim().min(1).max(1_000) })).mutation(async ({ input, ctx }) => {
      const submission = await getEdSubmission(input.submissionId, ctx);
      if (["ready_for_owner_initial_import", "ready_for_owner_final_import", "final_imported"].includes(submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This submission is locked for Owner import processing." });
      const finalFollowUp = isPostInitialImportStatus(submission.status);
      await rawExec(`UPDATE coordinator_submissions SET status = ? WHERE id = ?`, [finalFollowUp ? "needs_coordinator_final_follow_up" : "needs_coordinator_follow_up", submission.id]);
      await audit({ eventId: submission.eventId, submissionId: submission.id, actorType: "event_director", action: finalFollowUp ? "coordinator_final_follow_up_requested" : "coordinator_follow_up_requested", newValue: input.note });
      return { ok: true };
    }),
    markReadyForInitialImport: publicProcedure.input(z.object({ submissionId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const submission = await getEdSubmission(input.submissionId, ctx);
      if (!canEdMarkReadyForInitialImport(submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This submission is not available for initial Owner import." });
      const centerRows = submission.centerId ? await rawQuery<{ centerName: string }>(`SELECT centerName FROM bowling_centers WHERE id = ? LIMIT 1`, [submission.centerId]) : [];
      const rows = await getSubmissionRows(submission.id);
      const { validated, summary } = submissionSummary(rows, { centerName: centerRows[0]?.centerName ?? null, leagueSession: submission.leagueSession });
      if (hasRosterReadinessErrors(validated)) throw new TRPCError({ code: "BAD_REQUEST", message: "This roster still needs minimum-field corrections or a captain for every team." });
      await rawExec(`UPDATE coordinator_submissions SET status = 'ready_for_owner_initial_import', readyForInitialImportAt = NOW(), edReviewedAt = NOW() WHERE id = ?`, [submission.id]);
      await audit({ eventId: submission.eventId, submissionId: submission.id, actorType: "event_director", action: "ready_for_owner_initial_import", newValue: JSON.stringify(summary) });
      return { ok: true, summary };
    }),
    markReadyForFinalImport: publicProcedure.input(z.object({ submissionId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      const submission = await getEdSubmission(input.submissionId, ctx);
      if (!canEdMarkReadyForFinalImport(submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This submission is not ready for final Owner import review." });
      const centerRows = submission.centerId ? await rawQuery<{ centerName: string }>(`SELECT centerName FROM bowling_centers WHERE id = ? LIMIT 1`, [submission.centerId]) : [];
      const rows = await getSubmissionRows(submission.id);
      const { validated, summary } = submissionSummary(rows, { centerName: centerRows[0]?.centerName ?? null, leagueSession: submission.leagueSession });
      if (hasRosterReadinessErrors(validated)) throw new TRPCError({ code: "BAD_REQUEST", message: "This roster still needs minimum-field corrections or a captain for every team." });
      await rawExec(`UPDATE coordinator_submissions SET status = 'ready_for_owner_final_import', readyForFinalImportAt = NOW(), edReviewedAt = NOW() WHERE id = ?`, [submission.id]);
      await audit({ eventId: submission.eventId, submissionId: submission.id, actorType: "event_director", action: "ready_for_owner_final_import", newValue: JSON.stringify(summary) });
      return { ok: true, summary };
    }),
  }),
});
