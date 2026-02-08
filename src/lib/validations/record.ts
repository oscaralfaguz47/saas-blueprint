import { z } from "zod";
import { emailSchema } from "./common";

/**
 * Record creation schema
 */
export const createRecordSchema = z.object({
  title: z.string().min(1, "Title is required").max(160, "Title must be 160 characters or less"),
  type: z.enum(["SCOPE_CHANGE", "DECISION", "BUDGET"], {
    message: "Invalid record type",
  }),
  description: z.string().max(5000, "Description too long").optional(),
  clientName: z.string().max(120, "Client name too long").optional(),
  clientEmail: emailSchema.optional(),
  amount: z.number().positive("Amount must be positive").optional(),
  currency: z.string().length(3, "Currency must be 3 characters (ISO code)").optional(),
  visibility: z.enum(["WORKSPACE", "RESTRICTED"]).default("WORKSPACE"),
  isSensitive: z.boolean().default(false),
});
