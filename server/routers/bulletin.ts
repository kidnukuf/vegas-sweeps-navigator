import { TRPCError } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { rawExec, rawQuery } from "../db";
import type { TrpcContext } from "../_core/context";
import { assertEventAccess } from "../_core/edAuth";
import { publicProcedure, router } from "../_core/trpc";
import { resolveCommunicationActor, type ResolvedCommunicationActor } from "./communications";
import { canModerateBulletin, canPostToBulletin, canReadBulletin, canSeeLocalOffer, isSafeBoardBody } from "./bulletin.logic";

const participantToken = z.string().min(1).max(2_000).optional();
const moderationAction = z.enum(["hide", "restore", "delete", "pin", "unpin", "lock", "unlock"]);
const toSqlDate = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 19).replace("T", " ") : null;

async function requireBoardRead(ctx: TrpcContext, eventId: number, centerId: number, token?: string): Promise<ResolvedCommunicationActor> {
  const actor = await resolveCommunicationActor(ctx, token);
  if (actor.actorType === "event_director") await assertEventAccess(ctx, eventId);
  if (!canReadBulletin(actor, eventId, centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "This bulletin board is available only to attendees at this event and bowling center." });
  return actor;
}

async function requireModerator(ctx: TrpcContext, eventId: number, token?: string) {
  const actor = await resolveCommunicationActor(ctx, token);
  if (actor.actorType === "event_director") await assertEventAccess(ctx, eventId);
  if (!canModerateBulletin(actor, eventId)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or the Event Director for this event can moderate the board." });
  return actor;
}

async function writeBoardAudit(eventId: number, centerId: number, postId: string | null, actor: ResolvedCommunicationActor, action: string, previousValue?: unknown, newValue?: unknown) {
  await rawExec(`INSERT INTO center_bulletin_audit_log (id, eventId, centerId, postId, actorType, actorId, action, previousValue, newValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), eventId, centerId, postId, actor.actorType, actor.actorId, action, previousValue === undefined ? null : JSON.stringify(previousValue), newValue === undefined ? null : JSON.stringify(newValue)]);
}

export const bulletinRouter = router({
  eventCenters: publicProcedure.input(z.object({ eventId: z.number().int().positive(), participantToken })).query(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx, input.participantToken);
    if (actor.actorType === "event_director") await assertEventAccess(ctx, input.eventId);
    if (actor.actorType === "bowler" || actor.actorType === "captain") {
      if (actor.eventId !== input.eventId || !actor.centerId) throw new TRPCError({ code: "FORBIDDEN", message: "You can view only your assigned event center." });
      return rawQuery(`SELECT id, centerName FROM bowling_centers WHERE id = ?`, [actor.centerId]);
    }
    if (actor.actorType === "coordinator") throw new TRPCError({ code: "FORBIDDEN", message: "The attendee bulletin board is available to Bowlers, Captains, Event Directors, and the Owner." });
    return rawQuery(`SELECT DISTINCT bc.id, bc.centerName FROM bowling_centers bc JOIN bowlers b ON b.centerId = bc.id WHERE b.eventId = ? ORDER BY bc.centerName`, [input.eventId]);
  }),
  list: publicProcedure.input(z.object({ eventId: z.number().int().positive(), centerId: z.number().int().positive(), participantToken })).query(async ({ input, ctx }) => {
    const actor = await requireBoardRead(ctx, input.eventId, input.centerId, input.participantToken);
    const moderates = canModerateBulletin(actor, input.eventId);
    const visibility = moderates ? "" : "AND isHidden = 0 AND isDeleted = 0";
    const posts = await rawQuery<{ id: string; parentPostId: string | null; authorActorType: string; body: string; isPinned: number; isHidden: number; isDeleted: number; lockedAt: Date | null; createdAt: Date; updatedAt: Date }>(`SELECT id, parentPostId, authorActorType, body, isPinned, isHidden, isDeleted, lockedAt, createdAt, updatedAt FROM center_bulletin_posts WHERE eventId = ? AND centerId = ? AND parentPostId IS NULL ${visibility} ORDER BY isPinned DESC, createdAt DESC LIMIT 150`, [input.eventId, input.centerId]);
    if (!posts.length) return [];
    const ids = posts.map((post) => post.id);
    const replies = await rawQuery<{ id: string; parentPostId: string; authorActorType: string; body: string; isHidden: number; isDeleted: number; createdAt: Date }>(`SELECT id, parentPostId, authorActorType, body, isHidden, isDeleted, createdAt FROM center_bulletin_posts WHERE parentPostId IN (${ids.map(() => "?").join(",")}) ${visibility} ORDER BY createdAt ASC LIMIT 500`, ids);
    return posts.map((post) => ({ ...post, replies: replies.filter((reply) => reply.parentPostId === post.id) }));
  }),
  createPost: publicProcedure.input(z.object({ eventId: z.number().int().positive(), centerId: z.number().int().positive(), body: z.string().trim().min(1).max(1_000), parentPostId: z.string().uuid().optional(), participantToken })).mutation(async ({ input, ctx }) => {
    const actor = await requireBoardRead(ctx, input.eventId, input.centerId, input.participantToken);
    if (!canPostToBulletin(actor, input.eventId, input.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Only authenticated Bowlers and Captains from this center can post to this board." });
    if (!isSafeBoardBody(input.body)) throw new TRPCError({ code: "BAD_REQUEST", message: "Posts must be between 1 and 1,000 characters." });
    if (input.parentPostId) {
      const parents = await rawQuery<{ id: string; lockedAt: Date | null; isHidden: number; isDeleted: number }>(`SELECT id, lockedAt, isHidden, isDeleted FROM center_bulletin_posts WHERE id = ? AND eventId = ? AND centerId = ? AND parentPostId IS NULL LIMIT 1`, [input.parentPostId, input.eventId, input.centerId]);
      const parent = parents[0];
      if (!parent || parent.isHidden || parent.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "The post you are replying to is unavailable." });
      if (parent.lockedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Replies are closed for this post." });
    }
    const id = uuidv4();
    await rawExec(`INSERT INTO center_bulletin_posts (id, eventId, centerId, parentPostId, authorActorType, authorActorId, body) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.eventId, input.centerId, input.parentPostId ?? null, actor.actorType, actor.actorId, input.body.trim()]);
    await writeBoardAudit(input.eventId, input.centerId, id, actor, input.parentPostId ? "reply_created" : "post_created", undefined, { bodyLength: input.body.trim().length });
    return { id };
  }),
  report: publicProcedure.input(z.object({ eventId: z.number().int().positive(), centerId: z.number().int().positive(), postId: z.string().uuid().optional(), localOfferId: z.string().uuid().optional(), category: z.enum(["inappropriate", "harassment", "spam", "safety", "other"]), note: z.string().trim().max(500).optional(), participantToken })).mutation(async ({ input, ctx }) => {
    const actor = await requireBoardRead(ctx, input.eventId, input.centerId, input.participantToken);
    if (!canPostToBulletin(actor, input.eventId, input.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Only authenticated Bowlers and Captains can submit board reports." });
    if (!input.postId && !input.localOfferId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a bulletin post or local offer to report." });
    if (input.postId) {
      const rows = await rawQuery<{ id: string }>(`SELECT id FROM center_bulletin_posts WHERE id = ? AND eventId = ? AND centerId = ? LIMIT 1`, [input.postId, input.eventId, input.centerId]);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That bulletin post was not found in your center." });
    }
    if (input.localOfferId) {
      const rows = await rawQuery<{ id: string }>(`SELECT id FROM local_event_offers WHERE id = ? AND eventId = ? AND (centerId IS NULL OR centerId = ?) LIMIT 1`, [input.localOfferId, input.eventId, input.centerId]);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That local offer is not available in your center." });
    }
    const id = uuidv4();
    await rawExec(`INSERT INTO center_bulletin_reports (id, postId, localOfferId, reporterActorType, reporterActorId, category, note) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.postId ?? null, input.localOfferId ?? null, actor.actorType, actor.actorId, input.category, input.note?.trim() ?? null]);
    return { id };
  }),
  moderatePost: publicProcedure.input(z.object({ eventId: z.number().int().positive(), postId: z.string().uuid(), action: moderationAction, participantToken })).mutation(async ({ input, ctx }) => {
    const actor = await requireModerator(ctx, input.eventId, input.participantToken);
    const posts = await rawQuery<{ id: string; centerId: number; isPinned: number; isHidden: number; isDeleted: number; lockedAt: Date | null }>(`SELECT id, centerId, isPinned, isHidden, isDeleted, lockedAt FROM center_bulletin_posts WHERE id = ? AND eventId = ? LIMIT 1`, [input.postId, input.eventId]);
    const post = posts[0];
    if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin post not found for this event." });
    const changes: Record<string, string> = { hide: "isHidden = 1", restore: "isHidden = 0, isDeleted = 0", delete: "isDeleted = 1", pin: "isPinned = 1", unpin: "isPinned = 0", lock: "lockedAt = NOW()", unlock: "lockedAt = NULL" };
    await rawExec(`UPDATE center_bulletin_posts SET ${changes[input.action]} WHERE id = ?`, [post.id]);
    await writeBoardAudit(input.eventId, post.centerId, post.id, actor, `moderation_${input.action}`, post, undefined);
    return { ok: true };
  }),
  listReports: publicProcedure.input(z.object({ eventId: z.number().int().positive(), participantToken })).query(async ({ input, ctx }) => {
    await requireModerator(ctx, input.eventId, input.participantToken);
    return rawQuery(`SELECT r.id, r.postId, r.localOfferId, r.category, r.note, r.status, r.createdAt, p.body AS postBody, o.businessName FROM center_bulletin_reports r LEFT JOIN center_bulletin_posts p ON p.id = r.postId LEFT JOIN local_event_offers o ON o.id = r.localOfferId LEFT JOIN center_bulletin_posts scoped ON scoped.id = r.postId WHERE (scoped.eventId = ? OR o.eventId = ?) AND r.status = 'open' ORDER BY r.createdAt DESC LIMIT 200`, [input.eventId, input.eventId]);
  }),
  resolveReport: publicProcedure.input(z.object({ eventId: z.number().int().positive(), reportId: z.string().uuid(), participantToken })).mutation(async ({ input, ctx }) => {
    const actor = await requireModerator(ctx, input.eventId, input.participantToken);
    const result = await rawExec(`UPDATE center_bulletin_reports r LEFT JOIN center_bulletin_posts p ON p.id = r.postId LEFT JOIN local_event_offers o ON o.id = r.localOfferId SET r.status = 'resolved', r.resolvedByActorId = ?, r.resolvedAt = NOW() WHERE r.id = ? AND (p.eventId = ? OR o.eventId = ?) AND r.status = 'open'`, [actor.actorId, input.reportId, input.eventId, input.eventId]);
    return { resolved: Boolean((result as { affectedRows?: number }).affectedRows) };
  }),
  offers: publicProcedure.input(z.object({ eventId: z.number().int().positive(), centerId: z.number().int().positive(), participantToken })).query(async ({ input, ctx }) => {
    const actor = await requireBoardRead(ctx, input.eventId, input.centerId, input.participantToken);
    const offers = await rawQuery<{ id: string; eventId: number; centerId: number | null; businessName: string; category: string | null; description: string | null; offerText: string | null; contactUrl: string | null; contactPhone: string | null; isSponsored: number }>(`SELECT id, eventId, centerId, businessName, category, description, offerText, contactUrl, contactPhone, isSponsored FROM local_event_offers WHERE eventId = ? AND isActive = 1 AND (centerId IS NULL OR centerId = ?) AND (startsAt IS NULL OR startsAt <= NOW()) AND (endsAt IS NULL OR endsAt >= NOW()) ORDER BY isSponsored DESC, businessName ASC`, [input.eventId, input.centerId]);
    return offers.filter((offer) => canSeeLocalOffer(actor, input.eventId, offer.centerId));
  }),
  ownerOffers: publicProcedure.input(z.object({ eventId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx);
    if (actor.actorType !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required for local offer management." });
    return rawQuery(`SELECT o.*, bc.centerName FROM local_event_offers o LEFT JOIN bowling_centers bc ON bc.id = o.centerId WHERE o.eventId = ? ORDER BY o.isActive DESC, o.updatedAt DESC`, [input.eventId]);
  }),
  saveOffer: publicProcedure.input(z.object({ id: z.string().uuid().optional(), eventId: z.number().int().positive(), centerId: z.number().int().positive().nullable(), businessName: z.string().trim().min(1).max(255), category: z.string().trim().max(80).optional(), description: z.string().trim().max(2_000).optional(), offerText: z.string().trim().max(1_000).optional(), contactUrl: z.string().trim().url().max(2_000).optional().or(z.literal("")), contactPhone: z.string().trim().max(32).optional(), startsAt: z.string().datetime().optional().or(z.literal("")), endsAt: z.string().datetime().optional().or(z.literal("")), isSponsored: z.boolean(), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx);
    if (actor.actorType !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required for local offer management." });
    if (input.centerId) {
      const centers = await rawQuery<{ id: number }>(`SELECT id FROM bowling_centers WHERE id = ? LIMIT 1`, [input.centerId]);
      if (!centers[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a valid bowling center or all centers." });
    }
    if (input.startsAt && input.endsAt && new Date(input.startsAt).getTime() > new Date(input.endsAt).getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "Offer start cannot be later than offer end." });
    const id = input.id ?? uuidv4();
    if (input.id) {
      const existing = await rawQuery<{ id: string }>(`SELECT id FROM local_event_offers WHERE id = ? AND eventId = ? LIMIT 1`, [id, input.eventId]);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Local offer not found for this event." });
      await rawExec(`UPDATE local_event_offers SET centerId = ?, businessName = ?, category = ?, description = ?, offerText = ?, contactUrl = ?, contactPhone = ?, startsAt = ?, endsAt = ?, isSponsored = ?, isActive = ? WHERE id = ?`, [input.centerId, input.businessName, input.category?.trim() || null, input.description?.trim() || null, input.offerText?.trim() || null, input.contactUrl?.trim() || null, input.contactPhone?.trim() || null, toSqlDate(input.startsAt), toSqlDate(input.endsAt), input.isSponsored ? 1 : 0, input.isActive ? 1 : 0, id]);
    } else {
      await rawExec(`INSERT INTO local_event_offers (id, eventId, centerId, businessName, category, description, offerText, contactUrl, contactPhone, startsAt, endsAt, isSponsored, isActive, createdByOwnerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.eventId, input.centerId, input.businessName, input.category?.trim() || null, input.description?.trim() || null, input.offerText?.trim() || null, input.contactUrl?.trim() || null, input.contactPhone?.trim() || null, toSqlDate(input.startsAt), toSqlDate(input.endsAt), input.isSponsored ? 1 : 0, input.isActive ? 1 : 0, null]);
    }
    return { id };
  }),
});
