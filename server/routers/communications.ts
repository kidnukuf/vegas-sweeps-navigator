import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { rawExec, rawQuery } from "../db";
import type { TrpcContext } from "../_core/context";
import { assertEventAccess, resolveEdSession } from "../_core/edAuth";
import { requireCoordinatorSession } from "../_core/coordinatorAuth";
import { ENV } from "../_core/env";
import { publicProcedure, router } from "../_core/trpc";
import { canSendToThread, canStartCommunication, canViewCommunicationThread, isSafeMessageBody, type CommunicationActor, type CommunicationActorType, type CommunicationThread } from "./communication.logic";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
const tokenInput = z.string().min(1).max(2_000).optional();
const actorTypes = ["bowler", "captain", "coordinator", "event_director", "owner"] as const;

export type ResolvedCommunicationActor = CommunicationActor & { eventId?: number | null; centerId?: number | null; teamId?: number | null; label: string };
type Actor = ResolvedCommunicationActor;
type ThreadRow = { id: string; eventId: number | null; centerId: number | null; threadType: string; lastMessageAt: Date | null; createdAt: Date };
type ParticipantRow = { threadId: string; actorType: CommunicationActorType; actorId: string };

function verifyParticipantToken(token?: string) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { bowlerId?: number; role?: string };
    return typeof payload.bowlerId === "number" && payload.role === "Bowler" ? payload : null;
  } catch { return null; }
}

export async function resolveCommunicationActor(ctx: TrpcContext, participantToken?: string): Promise<Actor> {
  const ed = await resolveEdSession(ctx);
  if (ed?.type === "owner") return { actorType: "owner", actorId: ctx.user?.openId ?? ENV.ownerOpenId, label: "Owner" };
  if (ed?.type === "staff" && ed.staffId) {
    const events = await rawQuery<{ id: number }>(`SELECT id FROM events WHERE createdByStaffId = ?`, [ed.staffId]);
    return { actorType: "event_director", actorId: String(ed.staffId), eventIds: events.map((event) => event.id), label: ed.staffName ?? "Event Director" };
  }
  try {
    const coordinator = await requireCoordinatorSession(ctx);
    const scopes = await rawQuery<{ eventId: number; centerId: number | null }>(`SELECT eventId, centerId FROM coordinator_scopes WHERE coordinatorAccountId = ?`, [coordinator.id]);
    return { actorType: "coordinator", actorId: String(coordinator.id), scopePairs: scopes, label: `${coordinator.firstName ?? ""} ${coordinator.lastName ?? ""}`.trim() || "Coordinator" };
  } catch {
    // A participant token is an accepted alternative session mechanism for Bowlers and Captains.
  }
  const payload = verifyParticipantToken(participantToken);
  if (!payload) throw new TRPCError({ code: "UNAUTHORIZED", message: "A current Bowl Vegas session is required for in-app messages." });
  const bowlers = await rawQuery<{ id: number; eventId: number; centerId: number | null; teamId: number | null; isCapitain: number; legalFirstName: string; legalLastName: string }>(
    `SELECT id, eventId, centerId, teamId, isCapitain, legalFirstName, legalLastName FROM bowlers WHERE id = ? LIMIT 1`,
    [payload.bowlerId],
  );
  const bowler = bowlers[0];
  if (!bowler) throw new TRPCError({ code: "UNAUTHORIZED", message: "Your participant record is no longer available." });
  return {
    actorType: bowler.isCapitain ? "captain" : "bowler",
    actorId: String(bowler.id),
    eventId: bowler.eventId,
    centerId: bowler.centerId,
    teamId: bowler.teamId,
    label: `${bowler.legalFirstName} ${bowler.legalLastName}`.trim(),
  };
}

async function resolveTarget(actorType: CommunicationActorType, actorId: string, eventId: number): Promise<Actor> {
  if (actorType === "owner") {
    if (actorId !== ENV.ownerOpenId) throw new TRPCError({ code: "NOT_FOUND", message: "Owner contact target not found." });
    return { actorType, actorId, label: "Owner" };
  }
  if (actorType === "coordinator") {
    const rows = await rawQuery<{ id: number; firstName: string | null; lastName: string | null }>(
      `SELECT a.id, a.firstName, a.lastName FROM coordinator_accounts a
       JOIN coordinator_scopes s ON s.coordinatorAccountId = a.id WHERE a.id = ? AND s.eventId = ? AND a.isActive = 1 LIMIT 1`,
      [Number(actorId), eventId],
    );
    const row = rows[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Coordinator contact target not found." });
    const scopes = await rawQuery<{ eventId: number; centerId: number | null }>(`SELECT eventId, centerId FROM coordinator_scopes WHERE coordinatorAccountId = ?`, [row.id]);
    return { actorType, actorId, scopePairs: scopes, label: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Coordinator" };
  }
  if (actorType === "event_director") {
    const rows = await rawQuery<{ id: number; name: string; eventId: number }>(
      `SELECT s.id, s.name, e.id AS eventId FROM ed_staff s JOIN events e ON e.createdByStaffId = s.id WHERE s.id = ? AND e.id = ? LIMIT 1`,
      [Number(actorId), eventId],
    );
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Event Director contact target not found." });
    return { actorType, actorId, eventIds: [eventId], label: rows[0].name || "Event Director" };
  }
  const rows = await rawQuery<{ id: number; eventId: number; centerId: number | null; teamId: number | null; isCapitain: number; legalFirstName: string; legalLastName: string }>(
    `SELECT id, eventId, centerId, teamId, isCapitain, legalFirstName, legalLastName FROM bowlers WHERE id = ? AND eventId = ? LIMIT 1`,
    [Number(actorId), eventId],
  );
  const row = rows[0];
  if (!row || (actorType === "captain" ? !row.isCapitain : Boolean(row.isCapitain))) throw new TRPCError({ code: "NOT_FOUND", message: "Participant contact target not found." });
  return { actorType, actorId, eventId: row.eventId, centerId: row.centerId, teamId: row.teamId, label: `${row.legalFirstName} ${row.legalLastName}`.trim() };
}

async function assertRelationship(actor: Actor, target: Actor, eventId: number) {
  if (!canStartCommunication(actor.actorType, target.actorType)) throw new TRPCError({ code: "FORBIDDEN", message: "This contact path is not available for your role." });
  if (actor.actorType === "bowler" || actor.actorType === "captain") {
    if (actor.eventId !== eventId) throw new TRPCError({ code: "FORBIDDEN", message: "You can message only within your current event." });
    if (target.actorType === "captain" && target.teamId !== actor.teamId) throw new TRPCError({ code: "FORBIDDEN", message: "You can contact only your own team captain." });
    if (target.actorType === "coordinator") {
      const inScope = target.scopePairs?.some((scope) => scope.eventId === eventId && (scope.centerId === null || scope.centerId === actor.centerId));
      if (!inScope) throw new TRPCError({ code: "FORBIDDEN", message: "That coordinator is not assigned to your center." });
    }
  }
  if (actor.actorType === "coordinator") {
    const scope = actor.scopePairs?.find((entry) => entry.eventId === eventId && (entry.centerId === null || entry.centerId === target.centerId));
    if (!scope && target.actorType !== "event_director") throw new TRPCError({ code: "FORBIDDEN", message: "You can contact participants only inside your coordinator scope." });
    if (target.actorType === "event_director" && !actor.scopePairs?.some((entry) => entry.eventId === eventId)) throw new TRPCError({ code: "FORBIDDEN", message: "That Event Director is outside your coordinator scope." });
  }
  if (actor.actorType === "event_director" && !actor.eventIds?.includes(eventId)) throw new TRPCError({ code: "FORBIDDEN", message: "You can contact only within events you manage." });
  if (actor.actorType === "owner" && target.eventId && target.eventId !== eventId) throw new TRPCError({ code: "FORBIDDEN", message: "Choose the target's event before starting a message." });
}

async function loadThread(threadId: string): Promise<CommunicationThread & { id: string; threadType: string; lastMessageAt: Date | null; createdAt: Date }> {
  const threads = await rawQuery<ThreadRow>(`SELECT id, eventId, centerId, threadType, lastMessageAt, createdAt FROM communication_threads WHERE id = ? LIMIT 1`, [threadId]);
  const thread = threads[0];
  if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Message thread not found." });
  const participants = await rawQuery<{ actorType: CommunicationActorType; actorId: string }>(`SELECT actorType, actorId FROM communication_participants WHERE threadId = ?`, [threadId]);
  return { ...thread, participants };
}

function actorScopeAllowsThread(actor: Actor, thread: CommunicationThread) {
  return canViewCommunicationThread(actor, thread);
}

function typeLabel(actorType: CommunicationActorType) {
  return actorType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const communicationsRouter = router({
  contactOptions: publicProcedure.input(z.object({ eventId: z.number().int().positive(), participantToken: tokenInput })).query(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx, input.participantToken);
    const options: Array<{ actorType: CommunicationActorType; actorId: string; label: string; subtitle: string }> = [];
    if (actor.actorType === "bowler" || actor.actorType === "captain") {
      if (actor.eventId !== input.eventId) throw new TRPCError({ code: "FORBIDDEN", message: "You can view contacts only for your current event." });
      if (actor.actorType === "bowler" && actor.teamId) {
        const captains = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; teamName: string | null }>(
          `SELECT b.id, b.legalFirstName, b.legalLastName, t.teamName FROM bowlers b LEFT JOIN teams t ON t.id = b.teamId WHERE b.eventId = ? AND b.teamId = ? AND b.isCapitain = 1 AND b.id <> ?`,
          [input.eventId, actor.teamId, Number(actor.actorId)],
        );
        captains.forEach((captain) => options.push({ actorType: "captain", actorId: String(captain.id), label: `${captain.legalFirstName} ${captain.legalLastName}`.trim(), subtitle: captain.teamName ?? "Team captain" }));
      }
      const coordinators = await rawQuery<{ id: number; firstName: string | null; lastName: string | null }>(
        `SELECT DISTINCT a.id, a.firstName, a.lastName FROM coordinator_accounts a JOIN coordinator_scopes s ON s.coordinatorAccountId = a.id WHERE a.isActive = 1 AND s.eventId = ? AND (s.centerId IS NULL OR s.centerId = ?)`,
        [input.eventId, actor.centerId],
      );
      coordinators.forEach((coordinator) => options.push({ actorType: "coordinator", actorId: String(coordinator.id), label: `${coordinator.firstName ?? ""} ${coordinator.lastName ?? ""}`.trim() || "Coordinator", subtitle: "Center coordinator" }));
    } else if (actor.actorType === "coordinator") {
      if (!actor.scopePairs?.some((scope) => scope.eventId === input.eventId)) throw new TRPCError({ code: "FORBIDDEN", message: "This event is outside your coordinator scope." });
      const scopeCenterIds = actor.scopePairs.filter((scope) => scope.eventId === input.eventId).map((scope) => scope.centerId).filter((id): id is number => id !== null);
      const centerClause = scopeCenterIds.length ? `AND b.centerId IN (${scopeCenterIds.map(() => "?").join(",")})` : "";
      const participants = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; isCapitain: number; centerName: string | null; teamName: string | null }>(
        `SELECT b.id, b.legalFirstName, b.legalLastName, b.isCapitain, bc.centerName, t.teamName FROM bowlers b LEFT JOIN bowling_centers bc ON bc.id = b.centerId LEFT JOIN teams t ON t.id = b.teamId WHERE b.eventId = ? ${centerClause} ORDER BY bc.centerName, t.teamName, b.legalLastName, b.legalFirstName LIMIT 2000`,
        [input.eventId, ...scopeCenterIds],
      );
      participants.forEach((participant) => options.push({ actorType: participant.isCapitain ? "captain" : "bowler", actorId: String(participant.id), label: `${participant.legalFirstName} ${participant.legalLastName}`.trim(), subtitle: `${participant.isCapitain ? "Captain" : "Bowler"} · ${participant.teamName ?? participant.centerName ?? "Assigned center"}` }));
      const eds = await rawQuery<{ id: number; name: string }>(`SELECT s.id, s.name FROM ed_staff s JOIN events e ON e.createdByStaffId = s.id WHERE e.id = ? LIMIT 1`, [input.eventId]);
      eds.forEach((ed) => options.push({ actorType: "event_director", actorId: String(ed.id), label: ed.name || "Event Director", subtitle: "Event Director" }));
    } else if (actor.actorType === "event_director" || actor.actorType === "owner") {
      if (actor.actorType === "event_director" && !actor.eventIds?.includes(input.eventId)) throw new TRPCError({ code: "FORBIDDEN", message: "You can view contacts only for events you manage." });
      const participants = await rawQuery<{ id: number; legalFirstName: string; legalLastName: string; isCapitain: number; centerName: string | null; teamName: string | null }>(
        `SELECT b.id, b.legalFirstName, b.legalLastName, b.isCapitain, bc.centerName, t.teamName FROM bowlers b LEFT JOIN bowling_centers bc ON bc.id = b.centerId LEFT JOIN teams t ON t.id = b.teamId WHERE b.eventId = ? ORDER BY bc.centerName, t.teamName, b.legalLastName, b.legalFirstName LIMIT 2000`,
        [input.eventId],
      );
      participants.forEach((participant) => options.push({ actorType: participant.isCapitain ? "captain" : "bowler", actorId: String(participant.id), label: `${participant.legalFirstName} ${participant.legalLastName}`.trim(), subtitle: `${participant.isCapitain ? "Captain" : "Bowler"} · ${participant.teamName ?? participant.centerName ?? "Assigned center"}` }));
      const coordinators = await rawQuery<{ id: number; firstName: string | null; lastName: string | null; centerName: string | null }>(`SELECT DISTINCT a.id, a.firstName, a.lastName, bc.centerName FROM coordinator_accounts a JOIN coordinator_scopes s ON s.coordinatorAccountId = a.id LEFT JOIN bowling_centers bc ON bc.id = s.centerId WHERE a.isActive = 1 AND s.eventId = ?`, [input.eventId]);
      coordinators.forEach((coordinator) => options.push({ actorType: "coordinator", actorId: String(coordinator.id), label: `${coordinator.firstName ?? ""} ${coordinator.lastName ?? ""}`.trim() || "Coordinator", subtitle: coordinator.centerName ?? "Coordinator" }));
      if (actor.actorType === "event_director") options.push({ actorType: "owner", actorId: ENV.ownerOpenId, label: "Owner", subtitle: "Platform owner" });
      if (actor.actorType === "owner") {
        const eds = await rawQuery<{ id: number; name: string }>(`SELECT id, name FROM ed_staff ORDER BY name LIMIT 500`);
        eds.forEach((ed) => options.push({ actorType: "event_director", actorId: String(ed.id), label: ed.name || "Event Director", subtitle: "Event Director" }));
      }
    }
    return options;
  }),
  startThread: publicProcedure.input(z.object({ eventId: z.number().int().positive(), targetActorType: z.enum(actorTypes), targetActorId: z.string().min(1).max(64), participantToken: tokenInput })).mutation(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx, input.participantToken);
    const target = await resolveTarget(input.targetActorType, input.targetActorId, input.eventId);
    if (actor.actorType === "event_director") await assertEventAccess(ctx, input.eventId);
    await assertRelationship(actor, target, input.eventId);
    const candidates = await rawQuery<{ threadId: string }>(
      `SELECT a.threadId FROM communication_participants a JOIN communication_participants b ON b.threadId = a.threadId JOIN communication_threads t ON t.id = a.threadId
       WHERE t.eventId = ? AND a.actorType = ? AND a.actorId = ? AND b.actorType = ? AND b.actorId = ? LIMIT 1`,
      [input.eventId, actor.actorType, actor.actorId, target.actorType, target.actorId],
    );
    if (candidates[0]) return { threadId: candidates[0].threadId, created: false, target };
    const id = uuidv4();
    const centerId = target.centerId ?? actor.centerId ?? null;
    await rawExec(`INSERT INTO communication_threads (id, eventId, centerId, teamId, threadType, createdByActorType, createdByActorId, lastMessageAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`, [id, input.eventId, centerId, target.teamId ?? actor.teamId ?? null, `${actor.actorType}_to_${target.actorType}`, actor.actorType, actor.actorId]);
    await rawExec(`INSERT INTO communication_participants (threadId, actorType, actorId, participantRole) VALUES (?, ?, ?, 'participant'), (?, ?, ?, 'participant')`, [id, actor.actorType, actor.actorId, id, target.actorType, target.actorId]);
    return { threadId: id, created: true, target };
  }),
  listThreads: publicProcedure.input(z.object({ eventId: z.number().int().positive(), participantToken: tokenInput })).query(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx, input.participantToken);
    if (actor.actorType === "event_director") await assertEventAccess(ctx, input.eventId);
    if ((actor.actorType === "bowler" || actor.actorType === "captain") && actor.eventId !== input.eventId) throw new TRPCError({ code: "FORBIDDEN", message: "You can view messages only for your current event." });
    if (actor.actorType === "coordinator" && !actor.scopePairs?.some((scope) => scope.eventId === input.eventId)) throw new TRPCError({ code: "FORBIDDEN", message: "This event is outside your coordinator scope." });
    let candidates: ThreadRow[];
    if (actor.actorType === "owner" || actor.actorType === "event_director") candidates = await rawQuery<ThreadRow>(`SELECT id, eventId, centerId, threadType, lastMessageAt, createdAt FROM communication_threads WHERE eventId = ? ORDER BY COALESCE(lastMessageAt, createdAt) DESC LIMIT 500`, [input.eventId]);
    else candidates = await rawQuery<ThreadRow>(`SELECT t.id, t.eventId, t.centerId, t.threadType, t.lastMessageAt, t.createdAt FROM communication_threads t JOIN communication_participants p ON p.threadId = t.id WHERE t.eventId = ? AND p.actorType = ? AND p.actorId = ? ORDER BY COALESCE(t.lastMessageAt, t.createdAt) DESC LIMIT 500`, [input.eventId, actor.actorType, actor.actorId]);
    if (!candidates.length) return [];
    const ids = candidates.map((thread) => thread.id);
    const placeholders = ids.map(() => "?").join(",");
    const participants = await rawQuery<ParticipantRow>(`SELECT threadId, actorType, actorId FROM communication_participants WHERE threadId IN (${placeholders})`, ids);
    const lastMessages = await rawQuery<{ threadId: string; body: string; createdAt: Date }>(`SELECT m.threadId, m.body, m.createdAt FROM communication_messages m JOIN (SELECT threadId, MAX(createdAt) AS lastCreatedAt FROM communication_messages WHERE threadId IN (${placeholders}) GROUP BY threadId) latest ON latest.threadId = m.threadId AND latest.lastCreatedAt = m.createdAt`, ids);
    return candidates.map((thread) => ({ ...thread, participants: participants.filter((participant) => participant.threadId === thread.id).map(({ actorType, actorId }) => ({ actorType, actorId })), lastMessage: lastMessages.find((message) => message.threadId === thread.id) ?? null })).filter((thread) => actorScopeAllowsThread(actor, thread));
  }),
  messages: publicProcedure.input(z.object({ threadId: z.string().uuid(), participantToken: tokenInput })).query(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx, input.participantToken);
    const thread = await loadThread(input.threadId);
    if (!actorScopeAllowsThread(actor, thread)) throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to view this message thread." });
    return rawQuery(`SELECT id, senderActorType, senderActorId, body, createdAt FROM communication_messages WHERE threadId = ? ORDER BY createdAt ASC, id ASC LIMIT 1000`, [input.threadId]);
  }),
  sendMessage: publicProcedure.input(z.object({ threadId: z.string().uuid(), body: z.string().trim().min(1).max(2_000), participantToken: tokenInput })).mutation(async ({ input, ctx }) => {
    const actor = await resolveCommunicationActor(ctx, input.participantToken);
    const thread = await loadThread(input.threadId);
    if (!canSendToThread(actor, thread)) throw new TRPCError({ code: "FORBIDDEN", message: "Only thread participants can send a message. Start a new authorized contact thread instead." });
    if (!isSafeMessageBody(input.body)) throw new TRPCError({ code: "BAD_REQUEST", message: "Messages must be between 1 and 2,000 characters." });
    const id = uuidv4();
    await rawExec(`INSERT INTO communication_messages (id, threadId, senderActorType, senderActorId, body) VALUES (?, ?, ?, ?, ?)`, [id, thread.id, actor.actorType, actor.actorId, input.body.trim()]);
    await rawExec(`UPDATE communication_threads SET lastMessageAt = NOW() WHERE id = ?`, [thread.id]);
    return { id, createdAt: new Date() };
  }),
  typeLabel: publicProcedure.input(z.object({ actorType: z.enum(actorTypes) })).query(({ input }) => typeLabel(input.actorType)),
});
