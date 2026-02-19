import { z } from "zod";

export const usageLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  meter: z.enum(["REQUESTS", "PDF_EXPORTS", "ZIP_EXPORTS"]).optional(),
});

export type UsageLedgerQuery = z.infer<typeof usageLedgerQuerySchema>;
