/**
 * notifyED — dual-write notification helper.
 *
 * Every call:
 *  1. Persists the notification to `ed_notifications` in the database so the
 *     Event Director can see it in the in-app feed regardless of email delivery.
 *  2. Also fires `notifyOwner` (Manus push / email) as a secondary channel.
 *
 * This replaces direct `notifyOwner()` calls throughout the app.
 * Category values: "signup" | "security" | "support" | "survey" | "ads" | "general"
 */

import { rawQuery } from "./db";
import { notifyOwner } from "./_core/notification";

export type NotifyCategory =
  | "signup"
  | "security"
  | "support"
  | "survey"
  | "ads"
  | "general";

export async function notifyED(payload: {
  title: string;
  content: string;
  category?: NotifyCategory;
}): Promise<void> {
  const { title, content, category = "general" } = payload;
  const now = Date.now();

  // 1. Persist to DB (non-fatal — never let a DB error block the main flow)
  try {
    await rawQuery(
      "INSERT INTO ed_notifications (title, content, category, isRead, createdAt) VALUES (?, ?, ?, 0, ?)",
      [title, content, category, now]
    );
  } catch (err) {
    console.warn("[notifyED] Failed to persist notification to DB:", err);
  }

  // 2. Fire Manus push / email (non-fatal)
  notifyOwner({ title, content }).catch(() => {});
}
