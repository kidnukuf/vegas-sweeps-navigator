/**
 * Shared ED authentication helpers.
 *
 * An "ED session" is valid when EITHER:
 *   1. The request carries a valid Manus OAuth session with role === "admin" (ctx.user), OR
 *   2. The request carries a valid ed_staff_token HTTP-only cookie (edStaff username/password login).
 *
 * Use `edStaffProcedure` in place of `protectedProcedure` for any procedure that should be
 * accessible to both the Manus owner and any edStaff account.
 */
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import { router, publicProcedure } from "./trpc";
import type { TrpcContext } from "./context";
import { rawQuery } from "../db";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
const STAFF_COOKIE = "ed_staff_token";

export interface EdSession {
  /** "admin" = Manus OAuth owner; "staff" = edStaff username/password account */
  type: "admin" | "staff";
  staffId?: number;
  staffName?: string;
  userId?: number;
}

/**
 * Verify the ed_staff_token cookie from the request.
 * Returns the staffId if valid, null otherwise.
 */
export function verifyStaffCookie(req: any): { staffId: number } | null {
  try {
    const token = req?.cookies?.[STAFF_COOKIE];
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload?.type !== "ed_staff" || !payload?.staffId) return null;
    return { staffId: payload.staffId };
  } catch {
    return null;
  }
}

/**
 * Resolve the ED session from the tRPC context.
 * Returns an EdSession if the caller is authenticated as an ED admin or edStaff member.
 * Returns null if not authenticated.
 */
export async function resolveEdSession(ctx: TrpcContext): Promise<EdSession | null> {
  // Path 1: Manus OAuth admin
  if (ctx.user?.role === "admin") {
    return { type: "admin", userId: ctx.user.id };
  }

  // Path 2: edStaff cookie
  const staffPayload = verifyStaffCookie(ctx.req);
  if (staffPayload) {
    const rows = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM ed_staff WHERE id = ? LIMIT 1`,
      [staffPayload.staffId]
    );
    if (rows[0]) {
      return { type: "staff", staffId: rows[0].id, staffName: rows[0].name };
    }
  }

  return null;
}

/**
 * Middleware that requires a valid ED session (Manus admin OR edStaff cookie).
 * Throws FORBIDDEN if neither is present.
 */
export async function requireEdSession(ctx: TrpcContext): Promise<EdSession> {
  const session = await resolveEdSession(ctx);
  if (!session) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Event Director access required. Please log in with your ED credentials.",
    });
  }
  return session;
}
