/**
 * Email Invitation Router
 *
 * tRPC endpoints for sending event invitations to bowlers.
 * - sendInvitation: Send invitation to a specific bowler
 * - sendTestEmail: Test SMTP configuration
 * - listInvitations: View invitation history
 *
 * All endpoints require admin authentication (role === 'admin').
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  sendInvitationEmail,
  sendTestEmail,
  initializeEmailInvitationTable,
} from "../emailInvitation";
import { rawQuery } from "../db";

export const emailInvitationRouter = router({
  /**
   * Send an invitation email to a bowler.
   *
   * Input:
   *   - firstName: Bowler's first name
   *   - lastName: Bowler's last name
   *   - eventName: Event name to include in email
   *   - eventDate: Event date (formatted string)
   *   - eventLocation: Event location
   *   - rsrvpUrl: URL for bowler to confirm attendance
   *   - customMessage: Optional custom message to include
   *   - spreadsheetId: Optional Google Sheet ID (overrides default)
   *   - sheetName: Optional sheet tab name (overrides default)
   *
   * Returns:
   *   - success: boolean
   *   - email: Email address that was sent to (if successful)
   *   - error: Error message (if failed)
   */
  sendInvitation: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        eventName: z.string().min(1),
        eventDate: z.string().min(1),
        eventLocation: z.string().min(1),
        rsrvpUrl: z.string().url(),
        customMessage: z.string().optional(),
        spreadsheetId: z.string().optional(),
        sheetName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Require admin role
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can send invitations",
        });
      }

      // Initialize table if needed
      await initializeEmailInvitationTable();

      // Send invitation
      const result = await sendInvitationEmail({
        firstName: input.firstName,
        lastName: input.lastName,
        eventName: input.eventName,
        eventDate: input.eventDate,
        eventLocation: input.eventLocation,
        rsrvpUrl: input.rsrvpUrl,
        customMessage: input.customMessage,
        sheetTarget: {
          spreadsheetId: input.spreadsheetId,
          sheetName: input.sheetName,
        },
      });

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to send invitation",
        });
      }

      return {
        success: true,
        email: result.email,
        message: `Invitation sent to ${result.email}`,
      };
    }),

  /**
   * Send a test email to verify SMTP configuration.
   *
   * Input:
   *   - testEmail: Email address to send test to
   *
   * Returns:
   *   - success: boolean
   *   - message: Status message
   */
  sendTest: protectedProcedure
    .input(
      z.object({
        testEmail: z.string().email(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Require admin role
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can send test emails",
        });
      }

      const result = await sendTestEmail(input.testEmail);

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.message,
        });
      }

      return result;
    }),

  /**
   * List recent invitation emails sent.
   *
   * Query parameters:
   *   - limit: Number of records to return (default: 50, max: 500)
   *   - eventName: Filter by event name (optional)
   *
   * Returns:
   *   - Array of invitation records with: id, bowler_name, email, event_name, sent_at, status
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(50),
        eventName: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Require admin role
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can view invitation history",
        });
      }

      try {
        let query = "SELECT * FROM email_invitations";
        const params: unknown[] = [];

        if (input.eventName) {
          query += " WHERE event_name = ?";
          params.push(input.eventName);
        }

        query += " ORDER BY sent_at DESC LIMIT ?";
        params.push(input.limit);

        const records = await rawQuery<{
          id: number;
          bowler_name: string;
          email: string;
          event_name: string;
          sent_at: number;
          status: string;
          created_at?: string;
        }>(query, params);

        return records.map((r) => ({
          id: r.id,
          bowlerName: r.bowler_name,
          email: r.email,
          eventName: r.event_name,
          sentAt: r.sent_at,
          status: r.status,
        }));
      } catch (err) {
        console.error("[emailInvitationRouter] Failed to list invitations:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve invitation history",
        });
      }
    }),

  /**
   * Get SMTP configuration status.
   *
   * Returns:
   *   - configured: boolean (true if SMTP_HOST, SMTP_USER, SMTP_PASS are set)
   *   - smtpHost: SMTP hostname (masked)
   *   - smtpPort: SMTP port
   *   - smtpFrom: Sender email address
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    // Require admin role
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can view email service status",
      });
    }

    const smtpHost = process.env.SMTP_HOST ?? "";
    const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const smtpUser = process.env.SMTP_USER ?? "";
    const smtpFrom = process.env.SMTP_FROM ?? "noreply@vegas-sweeps.local";

    const configured = !!(smtpHost && smtpUser);

    return {
      configured,
      smtpHost: configured ? smtpHost.replace(/(.{2})(.*)(.{2})/, "$1***$3") : "not configured",
      smtpPort,
      smtpFrom,
      message: configured
        ? "SMTP is configured and ready to send emails"
        : "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.",
    };
  }),
});
