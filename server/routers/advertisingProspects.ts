import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rawExec, rawQuery, writeAuditLog } from "../db";
import { requireOwner } from "../_core/edAuth";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { buildOutreachDraftPrompt, prospectStatuses } from "./advertisingProspects.logic";

const status = z.enum(prospectStatuses);

export const advertisingProspectsRouter = router({
  list: publicProcedure.input(z.object({ eventId: z.number().int().positive(), status: status.optional(), search: z.string().trim().max(120).optional() })).query(async ({ input, ctx }) => {
    await requireOwner(ctx);
    const where = ["eventId = ?"];
    const values: unknown[] = [input.eventId];
    if (input.status) { where.push("researchStatus = ?"); values.push(input.status); }
    if (input.search) { where.push("(businessName LIKE ? OR category LIKE ? OR address LIKE ?)"); values.push(`%${input.search}%`, `%${input.search}%`, `%${input.search}%`); }
    return rawQuery(`SELECT * FROM advertising_prospects WHERE ${where.join(" AND ")} ORDER BY FIELD(researchStatus, 'research_ready', 'follow_up', 'contacted', 'converted', 'declined', 'archived'), businessName`, values);
  }),
  updateTracking: publicProcedure.input(z.object({ id: z.string().uuid(), eventId: z.number().int().positive(), researchStatus: status, ownerNotes: z.string().trim().max(2_000).optional(), markContacted: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
    const owner = await requireOwner(ctx);
    const prospects = await rawQuery<{ id: string; businessName: string; researchStatus: string }>(`SELECT id, businessName, researchStatus FROM advertising_prospects WHERE id = ? AND eventId = ? LIMIT 1`, [input.id, input.eventId]);
    const prospect = prospects[0];
    if (!prospect) throw new TRPCError({ code: "NOT_FOUND", message: "Advertising prospect not found for this event." });
    await rawExec(`UPDATE advertising_prospects SET researchStatus = ?, ownerNotes = ?, contactedAt = CASE WHEN ? = 1 AND contactedAt IS NULL THEN NOW() ELSE contactedAt END WHERE id = ?`, [input.researchStatus, input.ownerNotes?.trim() || null, input.markContacted ? 1 : 0, prospect.id]);
    await writeAuditLog({ eventId: input.eventId, actorRole: "Owner", actorId: owner.userId, action: "owner_update_advertising_prospect", targetId: prospect.id, targetType: "advertising_prospect", details: `Owner changed prospect ${prospect.businessName} from ${prospect.researchStatus} to ${input.researchStatus}` });
    return { success: true };
  }),
  generateOutreachDraft: publicProcedure.input(z.object({ id: z.string().uuid(), eventId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const owner = await requireOwner(ctx);
    const prospects = await rawQuery<{ id: string; businessName: string; category: string | null; contactRoute: string | null; fitRationale: string | null; ethicalPositioning: string | null }>(`SELECT id, businessName, category, contactRoute, fitRationale, ethicalPositioning FROM advertising_prospects WHERE id = ? AND eventId = ? LIMIT 1`, [input.id, input.eventId]);
    const prospect = prospects[0];
    if (!prospect) throw new TRPCError({ code: "NOT_FOUND", message: "Advertising prospect not found for this event." });
    const prompt = buildOutreachDraftPrompt(prospect);
    let generated: unknown;
    try {
      const response = await invokeLLM({
        model: "gpt-5-mini",
        maxCompletionTokens: 1_200,
        reasoning: { effort: "minimal" },
        messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "outreach_email_draft",
            strict: true,
            schema: {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
              },
              required: ["subject", "body"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message.content;
      generated = typeof content === "string" ? JSON.parse(content) : null;
    } catch (error) {
      console.error("[Advertising prospects] outreach draft generation failed", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The draft generator could not create an email at this time. No email was sent." });
    }
    const draft = z.object({ subject: z.string().trim().min(8).max(180), body: z.string().trim().min(80).max(2_500) }).safeParse(generated);
    if (!draft.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The draft generator returned an invalid response. No email was sent." });
    await writeAuditLog({ eventId: input.eventId, actorRole: "Owner", actorId: owner.userId, action: "owner_generated_advertising_outreach_draft", targetId: prospect.id, targetType: "advertising_prospect", details: `Generated a review-only outreach email draft for ${prospect.businessName}; no email was sent.` });
    return { businessName: prospect.businessName, ...draft.data };
  }),
});
