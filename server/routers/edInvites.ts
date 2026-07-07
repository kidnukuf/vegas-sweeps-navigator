import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rawExec, rawQuery } from "../db";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export const edInvitesRouter = router({
  /**
   * Generate a new ED invite token (owner only)
   */
  generateInvite: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        expiresInDays: z.number().int().positive().default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only the owner can generate invites
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can generate ED invites",
        });
      }

      // Generate a secure random token
      const token = crypto.randomBytes(32).toString("hex");
      const now = Date.now();
      const expiresAt = now + input.expiresInDays * 24 * 60 * 60 * 1000;

      // Insert into ed_invites table
      await rawExec(
        `INSERT INTO ed_invites (token, email, createdBy, createdAt, expiresAt, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [token, input.email, ctx.user.id, now, expiresAt]
      );

      // Return the invite link
      const inviteUrl = `${process.env.VITE_APP_URL || "http://localhost:3000"}/ed-signup?token=${token}`;

      return {
        token,
        email: input.email,
        inviteUrl,
        expiresAt,
      };
    }),

  /**
   * List all ED invites (owner only)
   */
  listInvites: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the owner can view ED invites",
      });
    }

    const invites = await rawQuery<{ id: number; token: string; email: string; createdAt: number; expiresAt: number; redeemedAt: number | null; status: string }>(
      `SELECT id, token, email, createdAt, expiresAt, redeemedAt, status
       FROM ed_invites
       ORDER BY createdAt DESC`
    );

    return invites || [];
  }),

  /**
   * Revoke an ED invite (owner only)
   */
  revokeInvite: protectedProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can revoke ED invites",
        });
      }

      await rawExec(`UPDATE ed_invites SET status = 'revoked' WHERE id = ?`, [
        input.inviteId,
      ]);

      return { success: true };
    }),

  /**
   * Validate an invite token (public, no auth required)
   */
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const result = await rawQuery<{ id: number; email: string; expiresAt: number; status: string }>(
        `SELECT id, email, expiresAt, status FROM ed_invites WHERE token = ? LIMIT 1`,
        [input.token]
      );

      if (!result || result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite token",
        });
      }

      const invite = result[0];

      // Check if token is expired
      if (Date.now() > invite.expiresAt) {
        await rawExec(`UPDATE ed_invites SET status = 'expired' WHERE id = ?`, [
          invite.id,
        ]);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite token has expired",
        });
      }

      // Check if token has already been redeemed
      if (invite.status === "redeemed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite token has already been used",
        });
      }

      // Check if token was revoked
      if (invite.status === "revoked") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite token has been revoked",
        });
      }

      return {
        valid: true,
        email: invite.email,
      };
    }),

  /**
   * Redeem an invite token and create ED account
   */
  redeemInvite: publicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(8, "Password must be at least 8 characters"),
        name: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      // Validate token first
      const result = await rawQuery<{ id: number; email: string; expiresAt: number; status: string }>(
        `SELECT id, email, expiresAt, status FROM ed_invites WHERE token = ? LIMIT 1`,
        [input.token]
      );

      if (!result || result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite token",
        });
      }

      const invite = result[0];

      // Validate token status
      if (Date.now() > invite.expiresAt) {
        await rawExec(`UPDATE ed_invites SET status = 'expired' WHERE id = ?`, [
          invite.id,
        ]);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite token has expired",
        });
      }

      if (invite.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite token is no longer valid",
        });
      }

      // Check if ED already exists with this email
      const existingED = await rawQuery<{ id: number }>(
        `SELECT id FROM app_users WHERE email = ? AND role = 'admin'`,
        [invite.email]
      );

      if (existingED && existingED.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An ED account already exists with this email",
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(input.password, 10);

      // Create ED user account
      const now = Date.now();
      const userResult = await rawExec(
        `INSERT INTO app_users (email, name, passwordHash, role, createdAt, updatedAt)
         VALUES (?, ?, ?, 'admin', ?, ?)`,
        [invite.email, input.name, passwordHash, now, now]
      );

      const userId = userResult.insertId;

      // Mark invite as redeemed
      await rawExec(
        `UPDATE ed_invites SET status = 'redeemed', redeemedAt = ?, redeemedBy = ? WHERE id = ?`,
        [now, userId, invite.id]
      );

      return {
        success: true,
        message: "ED account created successfully",
        email: invite.email,
      };
    }),

  /**
   * ED login with email/password
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Find ED user
      const result = await rawQuery<{ id: number; email: string; name: string; passwordHash: string; role: string }>(
        `SELECT id, email, name, passwordHash, role FROM app_users WHERE email = ? AND role = 'admin' LIMIT 1`,
        [input.email]
      );

      if (!result || result.length === 0) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      const user = result[0];

      // Verify password
      const passwordValid = await bcrypt.compare(input.password, user.passwordHash);

      if (!passwordValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Return user info (session will be set by caller)
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }),
});
