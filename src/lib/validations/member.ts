import {
  BillingAccessLevel,
  FinanceResponsibility,
  FinancialAccessScope,
  WorkspaceRole,
} from "@prisma/client";
import { z } from "zod";

export const updateMemberStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["Owner", "Admin", "Finance", "Member"]),
});

const memberAccessFields = {
  workspaceRole: z.nativeEnum(WorkspaceRole).optional(),
  financialAccess: z.nativeEnum(FinancialAccessScope).optional(),
  financeResponsibility: z.nativeEnum(FinanceResponsibility).optional(),
  billingAccess: z.nativeEnum(BillingAccessLevel).optional(),
  role: z.enum(["Owner", "Admin", "Finance", "Member"]).optional(),
} as const;

export const updateMemberAccessSchema = z
  .object(memberAccessFields)
  .refine(
    (d) =>
      d.workspaceRole !== undefined ||
      d.financialAccess !== undefined ||
      d.financeResponsibility !== undefined ||
      d.billingAccess !== undefined ||
      d.role !== undefined,
    { message: "At least one access field must be provided" }
  );

/**
 * @deprecated Use `updateMemberAccessSchema` (superset). Alias removed in F-phase.
 * D-1a: same Zod implementation as `updateMemberAccessSchema`.
 */
export const updateMember4AxisSchema = updateMemberAccessSchema;

export type UpdateMemberAccessInput = z.infer<typeof updateMemberAccessSchema>;
export type UpdateMember4AxisInput = UpdateMemberAccessInput;
