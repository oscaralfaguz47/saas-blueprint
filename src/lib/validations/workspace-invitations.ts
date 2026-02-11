import { z } from "zod";

const PAGE_SIZE = 10;

export const invitationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(PAGE_SIZE),
  cursor: z.string().optional(),
  sortBy: z.enum(["email", "status", "invitedAt", "expiresAt"]).default("invitedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().max(200).optional(),
  statuses: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.trim()).filter(Boolean) : undefined
    ),
});

export type InvitationsListQuery = z.infer<typeof invitationsListQuerySchema>;

export const INVITATIONS_PAGE_SIZE = PAGE_SIZE;
