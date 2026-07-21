/**
 * ED Staff authentication router.
 * Allows non-Manus users to log in to the Admin Dashboard with a username + password.
 * The owner (Manus OAuth admin) can create and delete staff accounts.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { rawQuery } from "../db";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
const STAFF_COOKIE = "ed_staff_token";
const SALT_ROUNDS = 12;

// ── Token helpers ────────────────────────────────────────────────────────────

function signStaffToken(staffId: number): string {
  return jwt.sign({ staffId, type: "ed_staff" }, JWT_SECRET, { expiresIn: "7d" });
}

function verifyStaffToken(token: string): { staffId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload?.type !== "ed_staff" || !payload?.staffId) return null;
    return { staffId: payload.staffId };
  } catch {
    return null;
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export const edStaffRouter = router({

  /** Log in with username + password. Sets an HTTP-only cookie. */
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const rows = await rawQuery<{
        id: number; username: string; passwordHash: string; name: string;
      }>(
        `SELECT id, username, passwordHash, name FROM ed_staff WHERE LOWER(username) = LOWER(?) LIMIT 1`,
        [input.username]
      );
      const staff = rows[0];
      if (!staff) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      }
      const valid = await bcrypt.compare(input.password, staff.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      }
      const token = signStaffToken(staff.id);
      // Set HTTP-only cookie (same pattern as bowler auth)
      const res = (ctx as any)?.res;
      if (res) {
        res.cookie(STAFF_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });
      }
      return { token, staffId: staff.id, name: staff.name, username: staff.username };
    }),

  /** Return the currently logged-in staff member from cookie. */
  me: publicProcedure
    .query(async ({ ctx }) => {
      const req = (ctx as any)?.req;
      const cookieToken = req?.cookies?.[STAFF_COOKIE];
      if (!cookieToken) return null;
      const payload = verifyStaffToken(cookieToken);
      if (!payload) return null;
      const rows = await rawQuery<{ id: number; username: string; name: string }>(
        `SELECT id, username, name FROM ed_staff WHERE id = ? LIMIT 1`,
        [payload.staffId]
      );
      return rows[0] ?? null;
    }),

  /** Log out — clear the staff cookie. */
  logout: publicProcedure
    .mutation(async ({ ctx }) => {
      const res = (ctx as any)?.res;
      if (res) {
        res.clearCookie(STAFF_COOKIE, { path: "/" });
      }
      return { ok: true };
    }),

  /** List all staff accounts. Owner-only. */
  listStaff: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await rawQuery<{ id: number; username: string; name: string; createdAt: Date }>(
        `SELECT id, username, name, createdAt FROM ed_staff ORDER BY name`
      );
      return rows;
    }),

  /** Create a new staff account. Owner-only. */
  createStaff: protectedProcedure
    .input(z.object({
      username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, dots, hyphens, underscores"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      name: z.string().min(1).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Check for duplicate username
      const existing = await rawQuery<{ id: number }>(
        `SELECT id FROM ed_staff WHERE LOWER(username) = LOWER(?) LIMIT 1`,
        [input.username]
      );
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Username "${input.username}" is already taken.` });
      }
      const hash = await bcrypt.hash(input.password, SALT_ROUNDS);
      await rawQuery(
        `INSERT INTO ed_staff (username, passwordHash, name, createdBy) VALUES (?, ?, ?, ?)`,
        [input.username, hash, input.name, ctx.user.id]
      );
      return { ok: true };
    }),

  /** Delete a staff account. Owner-only. */
  deleteStaff: protectedProcedure
    .input(z.object({ staffId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await rawQuery(`DELETE FROM ed_staff WHERE id = ?`, [input.staffId]);
      return { ok: true };
    }),

  /** Change a staff member's password. Owner-only. */
  resetStaffPassword: protectedProcedure
    .input(z.object({
      staffId: z.number(),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const hash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await rawQuery(`UPDATE ed_staff SET passwordHash = ? WHERE id = ?`, [hash, input.staffId]);
      return { ok: true };
    }),
});
