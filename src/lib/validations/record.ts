import { z } from "zod";
import { emailSchema } from "./common";

/**
 * Record creation schema — B1
 * amount: >= 0 (zero is valid, e.g. free approvals)
 * currency: ISO 4217 — exactly 3 uppercase letters
 */
export const createRecordSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(160, "Title must be 160 characters or less")
    .trim(),
  type: z.enum(["SCOPE_CHANGE", "DECISION", "BUDGET"], {
    message: "Invalid record type",
  }),
  description: z.string().max(5000, "Description too long").trim().optional(),
  clientName: z.string().max(120, "Client name too long").trim().optional(),
  clientEmail: emailSchema.optional(),
  amount: z
    .number()
    .min(0, "Amount must be zero or positive")
    .optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be a valid ISO 4217 code (e.g. USD)")
    .optional(),
  visibility: z.enum(["WORKSPACE", "RESTRICTED"]).default("WORKSPACE"),
  isSensitive: z.boolean().default(false),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
