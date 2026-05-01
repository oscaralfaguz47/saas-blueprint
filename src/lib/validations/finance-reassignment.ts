import { z } from "zod";

export const reassignBodySchema = z
  .object({
    targetMembershipId: z.string().cuid().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type ReassignBody = z.infer<typeof reassignBodySchema>;
