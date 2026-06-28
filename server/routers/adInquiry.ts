import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";
import { notifyED } from "../notifyED";

export const adInquiryRouter = router({
  // ── Public: someone tapped an "Advertise Here" placeholder and submitted the form ──
  submit: publicProcedure
    .input(
      z.object({
        eventId: z.number().nullable().optional(),
        name: z.string().min(1, "Name is required"),
        company: z.string().optional(),
        contact: z.string().min(1, "A phone or email is required"),
        message: z.string().min(1, "Please tell us a bit about your interest"),
        slotLabel: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await rawQuery(
        `INSERT INTO ad_inquiries (eventId, name, company, contact, message, slotLabel, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
        [
          input.eventId ?? null,
          input.name.trim(),
          input.company?.trim() || null,
          input.contact.trim(),
          input.message.trim(),
          input.slotLabel?.trim() || null,
          Date.now(),
        ]
      );

      notifyED({ category: "ads" as const,
        title: "📣 New Advertiser Lead",
        content: `Someone is interested in advertising on the app.\n\nName: ${input.name}\nCompany: ${input.company || "—"}\nContact: ${input.contact}\nFrom slot: ${input.slotLabel || "—"}\n\nMessage:\n${input.message}\n\nView in ED Portal → Advertiser Leads.`,
      }).catch(() => {});

      return { ok: true as const };
    }),

  // ── ED: list leads (Advertiser Leads inbox) ──
  list: publicProcedure
    .input(z.object({ status: z.enum(["new", "read", "archived", "all"]).default("all") }))
    .query(async ({ input }) => {
      if (input.status === "all") {
        return rawQuery(
          `SELECT id, eventId, name, company, contact, message, slotLabel, status, createdAt
           FROM ad_inquiries ORDER BY createdAt DESC LIMIT 500`,
          []
        );
      }
      return rawQuery(
        `SELECT id, eventId, name, company, contact, message, slotLabel, status, createdAt
         FROM ad_inquiries WHERE status = ? ORDER BY createdAt DESC LIMIT 500`,
        [input.status]
      );
    }),

  // ── ED: update a lead's status (read / archived / back to new) ──
  setStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.enum(["new", "read", "archived"]) }))
    .mutation(async ({ input }) => {
      await rawQuery(`UPDATE ad_inquiries SET status = ? WHERE id = ?`, [input.status, input.id]);
      return { ok: true as const };
    }),

  // ── ED: count of new leads (for a badge) ──
  newCount: publicProcedure.query(async () => {
    const rows = await rawQuery<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ad_inquiries WHERE status = 'new'`,
      []
    );
    return rows[0]?.c ?? 0;
  }),
});
