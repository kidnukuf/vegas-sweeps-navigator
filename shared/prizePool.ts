/**
 * Prize Pool — Zod schemas and derived TypeScript types.
 *
 * Three concepts:
 *   PrizePool        — event-level fund + paytable mode
 *   PaytableEntry    — ordered list of place → payout rules
 *   TeamPayout       — per-team finishing result, payout amount, denomination breakdown
 *
 * Import from this file for both server-side validation and client-side form schemas.
 */

import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Positive decimal string that represents a dollar amount (e.g. "1500.00"). */
const dollarAmount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid dollar amount (e.g. 150.00)")
  .or(z.number().nonnegative().transform((n) => n.toFixed(2)));

/** Percentage value 0–100 with up to 3 decimal places (e.g. "30.000"). */
const percentageAmount = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Must be a valid percentage (e.g. 30.000)")
  .refine((v) => parseFloat(v) <= 100, "Percentage cannot exceed 100")
  .or(
    z
      .number()
      .min(0)
      .max(100)
      .transform((n) => n.toFixed(3))
  );

// ─── Paytable mode ────────────────────────────────────────────────────────────

export const PaytableModeSchema = z.enum(["percentage", "rank"]);
export type PaytableMode = z.infer<typeof PaytableModeSchema>;

// ─── Prize Pool ───────────────────────────────────────────────────────────────

export const PrizePoolSchema = z.object({
  id: z.number().int().positive(),
  eventId: z.number().int().positive(),
  totalAmount: dollarAmount,
  paytableMode: PaytableModeSchema,
  notes: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PrizePoolShape = z.infer<typeof PrizePoolSchema>;

/** Input schema for creating or replacing a prize pool. */
export const UpsertPrizePoolSchema = z.object({
  eventId: z.number().int().positive(),
  totalAmount: dollarAmount,
  paytableMode: PaytableModeSchema,
  notes: z.string().max(1000).nullable().optional(),
});
export type UpsertPrizePoolInput = z.infer<typeof UpsertPrizePoolSchema>;

// ─── Paytable Entry ───────────────────────────────────────────────────────────

export const PaytableEntrySchema = z.object({
  id: z.number().int().positive(),
  prizePoolId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  place: z.number().int().min(1),
  amount: dollarAmount.nullable().optional(),
  percentage: percentageAmount.nullable().optional(),
  label: z.string().max(100).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PaytableEntryShape = z.infer<typeof PaytableEntrySchema>;

/** Input schema for a single paytable entry row. */
export const UpsertPaytableEntrySchema = z
  .object({
    id: z.number().int().positive().optional(), // omit for new entries
    prizePoolId: z.number().int().positive(),
    eventId: z.number().int().positive(),
    place: z.number().int().min(1),
    amount: dollarAmount.nullable().optional(),
    percentage: percentageAmount.nullable().optional(),
    label: z.string().max(100).nullable().optional(),
  })
  .refine(
    (v) => v.amount != null || v.percentage != null,
    "Either amount or percentage must be provided"
  );
export type UpsertPaytableEntryInput = z.infer<typeof UpsertPaytableEntrySchema>;

/** Batch input: replace all paytable entries for an event in one call. */
export const SetPaytableSchema = z.object({
  eventId: z.number().int().positive(),
  prizePoolId: z.number().int().positive(),
  entries: z
    .array(
      z.object({
        place: z.number().int().min(1),
        amount: dollarAmount.nullable().optional(),
        percentage: percentageAmount.nullable().optional(),
        label: z.string().max(100).nullable().optional(),
      })
    )
    .min(1, "Paytable must have at least one entry"),
});
export type SetPaytableInput = z.infer<typeof SetPaytableSchema>;

// ─── Denomination Breakdown ───────────────────────────────────────────────────

/**
 * Cash denomination breakdown for a payout.
 * Keys are bill/coin face values as strings; values are counts.
 * Standard US denominations: 100, 50, 20, 10, 5, 1
 */
export const DenominationBreakdownSchema = z.record(
  z.enum(["100", "50", "20", "10", "5", "1"]),
  z.number().int().min(0)
);
export type DenominationBreakdown = z.infer<typeof DenominationBreakdownSchema>;

/** Compute the total dollar value of a denomination breakdown. */
export function denominationTotal(breakdown: DenominationBreakdown): number {
  return Object.entries(breakdown).reduce(
    (sum, [bill, count]) => sum + parseInt(bill, 10) * count,
    0
  );
}

// ─── Team Payout ──────────────────────────────────────────────────────────────

export const TeamPayoutSchema = z.object({
  id: z.number().int().positive(),
  eventId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  prizePoolId: z.number().int().positive().nullable().optional(),
  paytableEntryId: z.number().int().positive().nullable().optional(),
  finishingPlace: z.number().int().min(1).nullable().optional(),
  score: z.string().nullable().optional(), // decimal string from DB
  payoutAmount: dollarAmount,
  denominationBreakdown: DenominationBreakdownSchema.nullable().optional(),
  paid: z.boolean(),
  paidAt: z.number().nullable().optional(),
  paidByEdStaffId: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TeamPayoutShape = z.infer<typeof TeamPayoutSchema>;

/** Input schema for recording or updating a team's payout. */
export const UpsertTeamPayoutSchema = z.object({
  id: z.number().int().positive().optional(), // omit for new rows
  eventId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  prizePoolId: z.number().int().positive().nullable().optional(),
  paytableEntryId: z.number().int().positive().nullable().optional(),
  finishingPlace: z.number().int().min(1).nullable().optional(),
  score: z.string().nullable().optional(),
  payoutAmount: dollarAmount,
  denominationBreakdown: DenominationBreakdownSchema.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type UpsertTeamPayoutInput = z.infer<typeof UpsertTeamPayoutSchema>;

/** Input schema for marking a payout as paid (with optional denomination breakdown). */
export const MarkPayoutPaidSchema = z.object({
  teamPayoutId: z.number().int().positive(),
  paidByEdStaffId: z.number().int().positive().nullable().optional(),
  denominationBreakdown: DenominationBreakdownSchema.nullable().optional(),
});
export type MarkPayoutPaidInput = z.infer<typeof MarkPayoutPaidSchema>;

/** Input schema for bulk-recording all team results for an event. */
export const BulkSetTeamPayoutsSchema = z.object({
  eventId: z.number().int().positive(),
  prizePoolId: z.number().int().positive(),
  results: z
    .array(
      z.object({
        teamId: z.number().int().positive(),
        finishingPlace: z.number().int().min(1),
        score: z.string().nullable().optional(),
        payoutAmount: dollarAmount,
        denominationBreakdown: DenominationBreakdownSchema.nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
    )
    .min(1),
});
export type BulkSetTeamPayoutsInput = z.infer<typeof BulkSetTeamPayoutsSchema>;
