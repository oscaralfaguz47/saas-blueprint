import { z } from "zod";

const PAGE_SIZE = 10;

export const membersListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(PAGE_SIZE),
  cursor: z.string().optional(),
  sortBy: z.enum(["user", "role", "status", "joined"]).default("joined"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().max(200).optional(),
  roles: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((r) => r.trim()).filter(Boolean) : undefined
    ),
  statuses: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.trim()).filter(Boolean) : undefined
    ),
});

export type MembersListQuery = z.infer<typeof membersListQuerySchema>;

export const MEMBERS_PAGE_SIZE = PAGE_SIZE;
