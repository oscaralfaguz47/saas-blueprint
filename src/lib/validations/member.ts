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

export const updateMember4AxisSchema = z
  .object({
    workspaceRole: z.nativeEnum(WorkspaceRole).optional(),
    financialAccess: z.nativeEnum(FinancialAccessScope).optional(),
    financeResponsibility: z.nativeEnum(FinanceResponsibility).optional(),
    billingAccess: z.nativeEnum(BillingAccessLevel).optional(),
  })
  .refine(
    (d) =>
      d.workspaceRole !== undefined ||
      d.financialAccess !== undefined ||
      d.financeResponsibility !== undefined ||
      d.billingAccess !== undefined,
    { message: "At least one 4-axis field must be provided" }
  );

export type UpdateMember4AxisInput = z.infer<typeof updateMember4AxisSchema>;
