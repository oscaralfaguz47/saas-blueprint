import { z } from "zod";

const financeTeamFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  departmentId: z.string().cuid().optional(),
  isActive: z.boolean().default(true),
  timeZone: z.string().trim().max(64).optional(),
  maxConcurrentAssignments: z.number().int().positive().max(10000).optional(),
} as const;

export const financeTeamCreateSchema = z.object(financeTeamFields);

export const financeTeamPatchSchema = z
  .object({
    name: financeTeamFields.name.optional(),
    description: financeTeamFields.description,
    departmentId: financeTeamFields.departmentId,
    isActive: z.boolean().optional(),
    timeZone: financeTeamFields.timeZone,
    maxConcurrentAssignments: financeTeamFields.maxConcurrentAssignments,
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.description !== undefined ||
      d.departmentId !== undefined ||
      d.isActive !== undefined ||
      d.timeZone !== undefined ||
      d.maxConcurrentAssignments !== undefined,
    { message: "At least one field must be provided" }
  );

export const financeTeamListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  departmentId: z.string().cuid().optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const financeTeamMemberAddSchema = z.object({
  membershipId: z.string().cuid(),
  weight: z.number().int().min(1).max(1000).optional(),
  isLead: z.boolean().optional(),
});

export const financeTeamMemberPatchSchema = z
  .object({
    weight: z.number().int().min(1).max(1000).optional(),
    isLead: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const financeTeamMemberListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export type FinanceTeamCreateInput = z.infer<typeof financeTeamCreateSchema>;
export type FinanceTeamPatchInput = z.infer<typeof financeTeamPatchSchema>;
export type FinanceTeamMemberAddInput = z.infer<typeof financeTeamMemberAddSchema>;
export type FinanceTeamMemberPatchInput = z.infer<typeof financeTeamMemberPatchSchema>;
