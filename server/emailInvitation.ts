/**
 * Email Invitation Service
 *
 * Sends event invitations to bowlers via email.
 * - Reads bowler email from Google Sheet (column C, no-color = director data)
 * - Uses nodemailer for SMTP delivery
 * - Includes rate limiting to prevent abuse
 * - Comprehensive error handling and logging
 *
 * Configuration via environment variables:
 *   SMTP_HOST: SMTP server hostname (e.g., smtp.gmail.com)
 *   SMTP_PORT: SMTP port (e.g., 587 for TLS)
 *   SMTP_USER: SMTP authentication username
 *   SMTP_PASS: SMTP authentication password
 *   SMTP_FROM: Sender email address (e.g., noreply@example.com)
 *   EMAIL_RATE_LIMIT_PER_HOUR: Max emails per hour (default: 100)
 */

import nodemailer from "nodemailer";
import { rawQuery, rawExec } from "./db";
import { getSheetsClient, resolveSheetTarget, type SheetTarget } from "./googleSheets";
import {
  generateHtmlTemplate,
  generatePlainTextTemplate,
  checkDuplicateSend,
  isOptedOut,
  logInvitationSend,
  isValidEmail,
  generateUnsubscribeUrl,
} from "./emailTemplates";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface InvitationParams {
  firstName: string;
  lastName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  rsrvpUrl: string;
  /** Optional: custom message to include in email body */
  customMessage?: string;
  /** Optional: sheet target for reading email from Google Sheets */
  sheetTarget?: SheetTarget;
  /** Optional: dry-run mode (log but don't send) */
  dryRun?: boolean;
  /** Optional: base URL for unsubscribe link */
  baseUrl?: string;
}

interface RateLimitRecord {
  email: string;
  count: number;
  hourStart: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_EMAIL = 2; // Column C (0-indexed)
const COL_FIRST_NAME = 8; // Column I
const COL_LAST_NAME = 9; // Column J

const RATE_LIMIT_PER_HOUR = parseInt(process.env.EMAIL_RATE_LIMIT_PER_HOUR ?? "100", 10);
const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? "noreply@vegas-sweeps.local";

// In-memory rate limit cache (cleared hourly)
const rateLimitCache = new Map<string, RateLimitRecord>();
let rateLimitHourStart = Date.now();

// ── SMTP Transporter ──────────────────────────────────────────────────────────
/**
 * Create and cache a nodemailer transporter.
 * Returns null if SMTP config is incomplete.
 */
let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      "[emailInvitation] SMTP config incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars."
    );
    return null;
  }

  try {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // Use TLS for 465, STARTTLS for 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    console.log(`[emailInvitation] SMTP transporter initialized: ${SMTP_HOST}:${SMTP_PORT}`);
    return cachedTransporter;
  } catch (err) {
    console.error("[emailInvitation] Failed to create SMTP transporter:", err);
    return null;
  }
}

// ── Rate Limiting ─────────────────────────────────────────────────────────────
/**
 * Check if an email has exceeded the hourly rate limit.
 * Returns { allowed: true } if OK, or { allowed: false, reason: string } if blocked.
 */
function checkRateLimit(email: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  // Reset cache if an hour has passed
  if (now - rateLimitHourStart > oneHourMs) {
    rateLimitCache.clear();
    rateLimitHourStart = now;
  }

  const record = rateLimitCache.get(email) || { email, count: 0, hourStart: now };

  if (record.count >= RATE_LIMIT_PER_HOUR) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${record.count}/${RATE_LIMIT_PER_HOUR} emails sent this hour`,
    };
  }

  record.count++;
  rateLimitCache.set(email, record);
  return { allowed: true };
}

// ── Google Sheets Integration ─────────────────────────────────────────────────
/**
 * Fetch bowler email from Google Sheet by row number.
 * Row is 1-indexed (as returned by findBowlerRow).
 * Returns null if not found or if sheets client is unavailable.
 */
async function getEmailFromSheet(
  rowNumber: number,
  resolved: { spreadsheetId: string; sheetName: string }
): Promise<string | null> {
  if (!resolved.spreadsheetId || !resolved.sheetName) return null;

  const sheets = await getSheetsClient();
  if (!sheets) return null;

  try {
    const range = `${resolved.sheetName}!C${rowNumber}:C${rowNumber}`;
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: resolved.spreadsheetId,
      range,
    });

    const values = resp.data.values?.[0];
    if (!values || !values[0]) {
      console.warn(`[emailInvitation] No email found at row ${rowNumber}`);
      return null;
    }

    const email = String(values[0]).trim();
    if (!email || email.toLowerCase() === "email") {
      // Skip header row
      return null;
    }

    return email;
  } catch (err) {
    console.error(`[emailInvitation] Failed to fetch email from sheet (row ${rowNumber}):`, err);
    return null;
  }
}

/**
 * Find bowler row by name in Google Sheet.
 * Returns 1-indexed row number or null if not found.
 */
async function findBowlerRowInSheet(
  firstName: string,
  lastName: string,
  resolved: { spreadsheetId: string; sheetName: string }
): Promise<number | null> {
  if (!resolved.spreadsheetId || !resolved.sheetName) return null;

  const sheets = await getSheetsClient();
  if (!sheets) return null;

  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: resolved.spreadsheetId,
      range: `${resolved.sheetName}!I:J`, // Columns I (first name) and J (last name)
    });

    const values = resp.data.values || [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const sheetFirstName = String(row[0] || "").trim().toLowerCase();
      const sheetLastName = String(row[1] || "").trim().toLowerCase();

      if (sheetFirstName === firstName.toLowerCase() && sheetLastName === lastName.toLowerCase()) {
        return i + 1; // 1-indexed row number
      }
    }

    console.warn(
      `[emailInvitation] Bowler not found in sheet: ${firstName} ${lastName}`
    );
    return null;
  } catch (err) {
    console.error(
      `[emailInvitation] Failed to find bowler in sheet (${firstName} ${lastName}):`,
      err
    );
    return null;
  }
}

// ── Email Template ────────────────────────────────────────────────────────────
// Moved to emailTemplates.ts for better organization and reusability

// ── Main Invitation Function ──────────────────────────────────────────────────
/**
 * Send an invitation email to a bowler.
 *
 * Flow:
 * 1. Resolve sheet target (use provided or fallback)
 * 2. Find bowler row by name in Google Sheet
 * 3. Fetch email from sheet (column C)
 * 4. Check rate limit
 * 5. Send email via SMTP
 * 6. Log result to database
 *
 * Returns { success: true, email: string } or { success: false, error: string }
 */
export async function sendInvitationEmail(
  params: InvitationParams
): Promise<{ success: boolean; email?: string; error?: string; messageId?: string; isDryRun?: boolean }> {
  try {
    // 1. Resolve sheet target
    const resolved = resolveSheetTarget(params.sheetTarget);
    if (!resolved.spreadsheetId || !resolved.sheetName) {
      return {
        success: false,
        error: "Sheet target not configured. Set spreadsheetId and sheetName.",
      };
    }

    // 2. Find bowler row
    const rowNumber = await findBowlerRowInSheet(
      params.firstName,
      params.lastName,
      resolved
    );
    if (!rowNumber) {
      return {
        success: false,
        error: `Bowler not found in sheet: ${params.firstName} ${params.lastName}`,
      };
    }

    // 3. Fetch email from sheet
    const email = await getEmailFromSheet(rowNumber, resolved);
    if (!email) {
      return {
        success: false,
        error: `No email found for ${params.firstName} ${params.lastName} (row ${rowNumber})`,
      };
    }

    // 4. Check rate limit
    const rateLimitCheck = checkRateLimit(email);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: rateLimitCheck.reason,
      };
    }

    // 5. Send email
    const transporter = getTransporter();
    if (!transporter) {
      return {
        success: false,
        error: "SMTP transporter not available. Check SMTP configuration.",
      };
    }

    // Check for opt-outs
    if (await isOptedOut(email)) {
      console.log(`[emailInvitation] Skipped ${email} (opted out)`);
      return {
        success: false,
        error: `${params.firstName} ${params.lastName} has opted out of invitations`,
      };
    }

    // Check for duplicate sends in last 24 hours
    const dupCheck = await checkDuplicateSend(email, params.eventName);
    if (dupCheck.isDuplicate) {
      const hoursSince = Math.floor((Date.now() - (dupCheck.lastSentAt || 0)) / (60 * 60 * 1000));
      console.log(`[emailInvitation] Duplicate send blocked for ${email} (sent ${hoursSince}h ago)`);
      return {
        success: false,
        error: `Invitation already sent to ${email} for this event (${hoursSince} hours ago)`,
      };
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return {
        success: false,
        error: `Invalid email format: ${email}`,
      };
    }

    // Generate templates
    const unsubscribeUrl = params.baseUrl ? generateUnsubscribeUrl(params.baseUrl, email) : undefined;
    const htmlContent = generateHtmlTemplate({
      ...params,
      email,
      unsubscribeUrl,
    });
    const plainTextContent = generatePlainTextTemplate({
      ...params,
      email,
      unsubscribeUrl,
    });

    // Dry-run mode: log but don't send
    if (params.dryRun) {
      console.log(`[emailInvitation] DRY-RUN: Would send to ${email} (${params.firstName} ${params.lastName})`);
      await logInvitationSend(
        `${params.firstName} ${params.lastName}`,
        email,
        params.eventName,
        null,
        true
      );
      return { success: true, email, isDryRun: true };
    }

    // Send email with both HTML and plain text
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: `You're Invited to ${params.eventName}!`,
      html: htmlContent,
      text: plainTextContent,
      replyTo: SMTP_FROM,
    });

    console.log(
      `[emailInvitation] Email sent to ${email} (${params.firstName} ${params.lastName}): ${info.messageId}`
    );

    // 6. Log to database
    await logInvitationSend(
      `${params.firstName} ${params.lastName}`,
      email,
      params.eventName,
      info.messageId,
      false
    );

    return { success: true, email, messageId: info.messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[emailInvitation] Error sending invitation:", errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ── Test Function ────────────────────────────────────────────────────────────
/**
 * Send a test invitation email to verify SMTP configuration.
 * Uses a hardcoded test email address.
 */
export async function sendTestEmail(testEmail: string): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      return {
        success: false,
        message: "SMTP transporter not available. Check SMTP configuration.",
      };
    }

    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
    .success { color: #28a745; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Email</h1>
    <p class="success">✓ SMTP configuration is working correctly!</p>
    <p>This is a test email from the Vegas Sweeps Navigator email invitation service.</p>
    <p>Sent at: ${new Date().toISOString()}</p>
  </div>
</body>
</html>
    `.trim();

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: testEmail,
      subject: "Vegas Sweeps Navigator - SMTP Test",
      html: testHtml,
    });

    console.log(`[emailInvitation] Test email sent to ${testEmail}: ${info.messageId}`);
    return {
      success: true,
      message: `Test email sent successfully to ${testEmail}. Message ID: ${info.messageId}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[emailInvitation] Test email failed:", errorMsg);
    return {
      success: false,
      message: `Test email failed: ${errorMsg}`,
    };
  }
}

// ── Database Setup ────────────────────────────────────────────────────────────
/**
 * Create the email_invitations table if it doesn't exist.
 * Call this once during app initialization.
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_event (event_name),
        INDEX idx_sent_at (sent_at)
      )
    `);
    console.log("[emailInvitation] email_invitations table initialized");
  } catch (err) {
    console.error("[emailInvitation] Failed to initialize email_invitations table:", err);
  }
}
