/** Company-scoped Event Director authorization helpers. */
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import { rawQuery } from "../db";
import { ENV } from "./env";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
const STAFF_COOKIE = "ed_staff_token";

export interface EdSession {
  type: "owner" | "platform_admin" | "staff";
  staffId?: number;
  staffName?: string;
  userId?: number;
  companyId?: number | null;
}

type ManusUserIdentity = { id: number; openId: string; role: "user" | "admin" } | null | undefined;

/** The configured Manus owner and an application-level administrator are both trusted owner identities. */
export function isManusOwnerUser(user: ManusUserIdentity): boolean {
  return Boolean(user && (user.openId === ENV.ownerOpenId || user.role === "admin"));
}

function getRawCookie(req: any, name: string): string | undefined {
  if (req?.cookies?.[name]) return req.cookies[name];
  const header = req?.headers?.cookie;
  if (!header) return undefined;
  try { return parseCookieHeader(header)[name]; } catch { return undefined; }
}

export function verifyStaffCookie(req: any): { staffId: number } | null {
  try {
    const token = getRawCookie(req, STAFF_COOKIE);
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET) as { type?: string; staffId?: number };
    return payload.type === "ed_staff" && payload.staffId ? { staffId: payload.staffId } : null;
  } catch { return null; }
}

export async function resolveEdSession(ctx: TrpcContext): Promise<EdSession | null> {
  // The configured Manus owner and the app's explicit admin role have cross-company owner access.
  const manusUser = ctx.user;
  if (isManusOwnerUser(manusUser) && manusUser) {
    return { type: "owner", userId: manusUser.id };
  }
  const cookie = verifyStaffCookie(ctx.req);
  if (!cookie) return null;
  const rows = await rawQuery<{ id: number; name: string; companyId: number | null; accessRole: "platform_admin" | "event_director" }>(
    `SELECT id, name, companyId, accessRole FROM ed_staff WHERE id = ? LIMIT 1`,
    [cookie.staffId],
  );
  const staff = rows[0];
  if (!staff) return null;
  return {
    type: staff.accessRole === "platform_admin" ? "platform_admin" : "staff",
    staffId: staff.id,
    staffName: staff.name,
    companyId: staff.companyId,
  };
}

export async function requireEdSession(ctx: TrpcContext): Promise<EdSession> {
  const session = await resolveEdSession(ctx);
  if (!session) throw new TRPCError({ code: "FORBIDDEN", message: "Event Director access required. Please log in with your ED credentials." });
  return session;
}

export function isOwnerSession(session: EdSession): boolean {
  return session.type === "owner";
}

/** Restricts private platform-owner tools to the configured Manus project owner. */
export async function requireOwner(ctx: TrpcContext): Promise<EdSession> {
  const session = await requireEdSession(ctx);
  if (!isOwnerSession(session)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required." });
  }
  return session;
}

export async function requirePlatformAdmin(ctx: TrpcContext): Promise<EdSession> {
  const session = await requireEdSession(ctx);
  if (session.type !== "owner" && session.type !== "platform_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform administrator access required." });
  }
  return session;
}

export function canAccessAssignedEvent(session: EdSession, assignmentExists: boolean): boolean {
  return session.type === "owner" || session.type === "platform_admin" || Boolean(session.staffId && session.companyId && assignmentExists);
}

/** Return only events available to the signed-in Event Director. */
export async function getAccessibleEvents(ctx: TrpcContext): Promise<Record<string, unknown>[]> {
  const session = await requireEdSession(ctx);
  if (session.type === "owner" || session.type === "platform_admin") {
    return rawQuery(`SELECT * FROM events ORDER BY id DESC`);
  }
  if (!session.staffId || !session.companyId) return [];
  return rawQuery(
    `SELECT e.* FROM events e
     INNER JOIN event_director_assignments a ON a.eventId = e.id
     WHERE a.staffId = ? AND e.companyId = ? ORDER BY e.id DESC`,
    [session.staffId, session.companyId],
  );
}

/** Block access unless the caller is a platform collaborator or assigned to this event in their own company. */
export async function assertEventAccess(ctx: TrpcContext, eventId: number): Promise<EdSession> {
  const session = await requireEdSession(ctx);
  if (session.type === "owner" || session.type === "platform_admin") return session;
  if (!session.staffId || !session.companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this event." });
  }
  const matches = await rawQuery<{ id: number }>(
    `SELECT e.id FROM events e INNER JOIN event_director_assignments a ON a.eventId = e.id
     WHERE e.id = ? AND e.companyId = ? AND a.staffId = ? LIMIT 1`,
    [eventId, session.companyId, session.staffId],
  );
  if (!canAccessAssignedEvent(session, Boolean(matches[0]))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this event." });
  }
  return session;
}

export async function assertBowlerAccess(ctx: TrpcContext, bowlerId: number): Promise<EdSession> {
  const rows = await rawQuery<{ eventId: number }>(`SELECT eventId FROM bowlers WHERE id = ? LIMIT 1`, [bowlerId]);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Bowler not found." });
  return assertEventAccess(ctx, rows[0].eventId);
}
