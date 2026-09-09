import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? "";

let transporter: nodemailer.Transporter | undefined;

export function isClaimVerificationDeliveryConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function getTransporter(): nodemailer.Transporter | null {
  if (!isClaimVerificationDeliveryConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendClaimVerificationEmail(input: {
  recipientEmail: string;
  recipientFirstName: string;
  eventName: string;
  verificationUrl: string;
  expiresInMinutes: number;
}): Promise<{ delivered: boolean }> {
  const activeTransporter = getTransporter();
  if (!activeTransporter) return { delivered: false };

  const safeFirstName = input.recipientFirstName.trim() || "Bowler";
  const text = [
    `Hello ${safeFirstName},`,
    "",
    `Use the secure button below to verify your email and finish claiming your ${input.eventName} Bowler Portal account.`,
    "",
    input.verificationUrl,
    "",
    `This link expires in ${input.expiresInMinutes} minutes and can be used only for this account claim. If you did not request it, you can ignore this email.`,
  ].join("\n");
  const html = `<p>Hello ${escapeHtml(safeFirstName)},</p><p>Use the secure button below to verify your email and finish claiming your <strong>${escapeHtml(input.eventName)}</strong> Bowler Portal account.</p><p><a href="${escapeAttribute(input.verificationUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#d97706;color:#ffffff;font-weight:700;text-decoration:none">Verify my email</a></p><p>This link expires in ${input.expiresInMinutes} minutes and can be used only for this account claim. If you did not request it, you can ignore this email.</p>`;

  await activeTransporter.sendMail({
    from: SMTP_FROM,
    to: input.recipientEmail,
    subject: `Verify your Bowl Vegas account for ${input.eventName}`,
    text,
    html,
  });
  return { delivered: true };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
