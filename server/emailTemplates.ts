/**
 * Email Templates & Safeguards
 *
 * Professional HTML/plain text templates for event invitations with:
 * - Clean, responsive HTML design
 * - Plain text fallback for email clients
 * - Opt-out link (unsubscribe)
 * - Duplicate send prevention (24-hour window)
 * - Dry-run/test mode
 * - Comprehensive logging
 */

import { rawQuery, rawExec } from "./db";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface EmailTemplateParams {
  firstName: string;
  lastName: string;
  email: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  rsrvpUrl: string;
  customMessage?: string;
  unsubscribeUrl?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  email?: string;
  error?: string;
  isDryRun?: boolean;
}

// ── Database Setup ────────────────────────────────────────────────────────────
/**
 * Initialize email_invitations table with additional safeguard columns.
 */
export async function initializeEmailInvitationTable(): Promise<void> {
  try {
    await rawExec(`
      CREATE TABLE IF NOT EXISTS email_invitations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bowler_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        event_name VARCHAR(255) NOT NULL,
        sent_at BIGINT NOT NULL,
        status VARCHAR(50) DEFAULT 'sent',
        message_id VARCHAR(255),
        is_dry_run BOOLEAN DEFAULT FALSE,
        opt_out BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_event (event_name),
        INDEX idx_sent_at (sent_at),
        INDEX idx_email_event (email, event_name)
      )
    `);
    console.log("[emailTemplates] email_invitations table initialized");
  } catch (err) {
    console.error("[emailTemplates] Failed to initialize email_invitations table:", err);
  }
}

// ── Duplicate Prevention ──────────────────────────────────────────────────────
/**
 * Check if an invitation was already sent to this email for this event
 * within the last 24 hours.
 *
 * Returns: { isDuplicate: boolean, lastSentAt?: number }
 */
export async function checkDuplicateSend(
  email: string,
  eventName: string
): Promise<{ isDuplicate: boolean; lastSentAt?: number }> {
  try {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    const result = await rawQuery<{ sent_at: number }>(
      `SELECT sent_at FROM email_invitations
       WHERE email = ? AND event_name = ? AND sent_at > ? AND status = 'sent'
       ORDER BY sent_at DESC LIMIT 1`,
      [email, eventName, twentyFourHoursAgo]
    );

    if (result.length > 0) {
      return { isDuplicate: true, lastSentAt: result[0].sent_at };
    }

    return { isDuplicate: false };
  } catch (err) {
    console.warn("[emailTemplates] Failed to check duplicate send:", err);
    // On error, allow the send (fail open, not closed)
    return { isDuplicate: false };
  }
}

// ── Opt-Out Handling ──────────────────────────────────────────────────────────
/**
 * Check if a bowler has opted out of event invitations.
 */
export async function isOptedOut(email: string): Promise<boolean> {
  try {
    const result = await rawQuery<{ opt_out: boolean }>(
      `SELECT opt_out FROM email_invitations WHERE email = ? AND opt_out = TRUE LIMIT 1`,
      [email]
    );
    return result.length > 0;
  } catch (err) {
    console.warn("[emailTemplates] Failed to check opt-out status:", err);
    return false;
  }
}

/**
 * Mark a bowler as opted out from invitations.
 */
export async function markOptedOut(email: string): Promise<void> {
  try {
    await rawExec(`UPDATE email_invitations SET opt_out = TRUE WHERE email = ?`, [email]);
    console.log(`[emailTemplates] Marked ${email} as opted out`);
  } catch (err) {
    console.error("[emailTemplates] Failed to mark opted out:", err);
  }
}

// ── HTML Email Template ───────────────────────────────────────────────────────
/**
 * Generate a professional, responsive HTML email template.
 *
 * Features:
 * - Gradient header with event emoji
 * - Event details in highlighted box
 * - Clear CTA button
 * - Optional custom message
 * - Opt-out link in footer
 * - Mobile-responsive design
 */
export function generateHtmlTemplate(params: EmailTemplateParams): string {
  const unsubscribeLink = params.unsubscribeUrl
    ? `<p style="margin-top: 20px; text-align: center;"><a href="${params.unsubscribeUrl}" style="color: #999; text-decoration: none; font-size: 11px;">Unsubscribe from event invitations</a></p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.eventName} - Event Invitation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .header p {
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
      color: #333;
    }
    .greeting strong {
      color: #667eea;
    }
    .event-details {
      background: linear-gradient(135deg, #f5f7fa 0%, #f9fafb 100%);
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .event-details p {
      margin: 12px 0;
      font-size: 15px;
    }
    .detail-label {
      font-weight: 600;
      color: #667eea;
      display: inline-block;
      min-width: 80px;
    }
    .detail-value {
      color: #333;
    }
    .custom-message {
      background: #f0f4ff;
      border-left: 4px solid #667eea;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 4px;
      font-style: italic;
      color: #555;
    }
    .cta-section {
      text-align: center;
      margin: 30px 0;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .footer {
      background-color: #f9f9f9;
      padding: 20px 30px;
      border-top: 1px solid #eee;
      font-size: 13px;
      color: #999;
      text-align: center;
    }
    .footer-note {
      margin: 10px 0;
    }
    @media (max-width: 600px) {
      .container { border-radius: 0; }
      .content { padding: 20px; }
      .header { padding: 30px 20px; }
      .header h1 { font-size: 24px; }
      .cta-button { display: block; padding: 16px 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You're Invited! 🎳</h1>
      <p>Join us for an exciting event</p>
    </div>

    <div class="content">
      <p class="greeting">Hi <strong>${escapeHtml(params.firstName)}</strong>,</p>

      <p>We're thrilled to invite you to join us for an unforgettable experience!</p>

      <div class="event-details">
        <p>
          <span class="detail-label">Event:</span>
          <span class="detail-value">${escapeHtml(params.eventName)}</span>
        </p>
        <p>
          <span class="detail-label">Date:</span>
          <span class="detail-value">${escapeHtml(params.eventDate)}</span>
        </p>
        <p>
          <span class="detail-label">Location:</span>
          <span class="detail-value">${escapeHtml(params.eventLocation)}</span>
        </p>
      </div>

      ${
        params.customMessage
          ? `<div class="custom-message">${escapeHtml(params.customMessage)}</div>`
          : ""
      }

      <p>To confirm your attendance and secure your spot, please click the button below:</p>

      <div class="cta-section">
        <a href="${escapeHtml(params.rsrvpUrl)}" class="cta-button">Confirm Your RSVP</a>
      </div>

      <p>If you have any questions or need assistance, please don't hesitate to reach out to our team.</p>

      <p>We can't wait to see you there!</p>

      <p>
        Best regards,<br>
        <strong>The Event Team</strong>
      </p>
    </div>

    <div class="footer">
      <p class="footer-note">This is an automated email. Please do not reply directly to this message.</p>
      ${unsubscribeLink}
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ── Plain Text Email Template ─────────────────────────────────────────────────
/**
 * Generate a plain text version of the invitation email.
 * Used as fallback for email clients that don't support HTML.
 */
export function generatePlainTextTemplate(params: EmailTemplateParams): string {
  const unsubscribeLink = params.unsubscribeUrl
    ? `\n\nUnsubscribe: ${params.unsubscribeUrl}`
    : "";

  return `
Hi ${params.firstName},

You're invited to join us for an exciting event!

EVENT DETAILS
─────────────────────────────────────────
Event:    ${params.eventName}
Date:     ${params.eventDate}
Location: ${params.eventLocation}

${params.customMessage ? `\nSPECIAL MESSAGE\n─────────────────────────────────────────\n${params.customMessage}\n` : ""}

CONFIRM YOUR ATTENDANCE
─────────────────────────────────────────
To confirm your attendance, please visit:
${params.rsrvpUrl}

If you have any questions, please reach out to our team.

We can't wait to see you there!

Best regards,
The Event Team

─────────────────────────────────────────
This is an automated email. Please do not reply directly to this message.${unsubscribeLink}
  `.trim();
}

// ── Logging ───────────────────────────────────────────────────────────────────
/**
 * Log an invitation send attempt to the database.
 */
export async function logInvitationSend(
  bowlerName: string,
  email: string,
  eventName: string,
  messageId: string | null,
  isDryRun: boolean = false
): Promise<void> {
  try {
    await rawExec(
      `INSERT INTO email_invitations (bowler_name, email, event_name, sent_at, status, message_id, is_dry_run)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bowlerName, email, eventName, Date.now(), "sent", messageId || null, isDryRun]
    );
  } catch (err) {
    console.warn("[emailTemplates] Failed to log invitation send:", err);
  }
}

/**
 * Get invitation history for a specific email/event combination.
 */
export async function getInvitationHistory(
  email: string,
  eventName?: string,
  limit: number = 10
): Promise<Array<{ sent_at: number; event_name: string; status: string; is_dry_run: boolean }>> {
  try {
    let query = `SELECT sent_at, event_name, status, is_dry_run FROM email_invitations WHERE email = ?`;
    const params: unknown[] = [email];

    if (eventName) {
      query += ` AND event_name = ?`;
      params.push(eventName);
    }

    query += ` ORDER BY sent_at DESC LIMIT ?`;
    params.push(limit);

    return await rawQuery<{ sent_at: number; event_name: string; status: string; is_dry_run: boolean }>(
      query,
      params
    );
  } catch (err) {
    console.error("[emailTemplates] Failed to get invitation history:", err);
    return [];
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
/**
 * Escape HTML special characters to prevent injection.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Generate an unsubscribe URL for a bowler.
 */
export function generateUnsubscribeUrl(baseUrl: string, email: string): string {
  const encodedEmail = encodeURIComponent(email);
  return `${baseUrl}/api/email/unsubscribe?email=${encodedEmail}`;
}
