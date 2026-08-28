import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import { rawQuery } from "../db";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
export const COORDINATOR_COOKIE = "coordinator_session";

function cookie(req: any, name: string) {
  if (req?.cookies?.[name]) return req.cookies[name];
  try { return req?.headers?.cookie ? parseCookieHeader(req.headers.cookie)[name] : undefined; } catch { return undefined; }
}

export async function resolveCoordinatorSession(ctx: TrpcContext) {
  try {
    const token = cookie(ctx.req, COORDINATOR_COOKIE);
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET) as { type?: string; coordinatorId?: number };
    if (payload.type !== "coordinator" || !payload.coordinatorId) return null;
    const rows = await rawQuery<{ id: number; email: string; firstName: string | null; lastName: string | null }>(
      `SELECT id, email, firstName, lastName FROM coordinator_accounts WHERE id = ? AND isActive = 1 LIMIT 1`, [payload.coordinatorId],
    );
    return rows[0] ?? null;
  } catch { return null; }
}

export async function requireCoordinatorSession(ctx: TrpcContext) {
  const session = await resolveCoordinatorSession(ctx);
  if (!session) throw new TRPCError({ code: "FORBIDDEN", message: "Coordinator sign-in is required." });
  return session;
}

export function signCoordinatorCookie(coordinatorId: number) {
  return jwt.sign({ type: "coordinator", coordinatorId }, JWT_SECRET, { expiresIn: "30d" });
}
