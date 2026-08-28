import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rawExec, rawQuery, writeAuditLog } from "../db";
import { requireOwner } from "../_core/edAuth";
import { publicProcedure, router } from "../_core/trpc";
import { prospectStatuses } from "./advertisingProspects.logic";

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
});
