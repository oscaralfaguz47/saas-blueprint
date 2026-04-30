import { z } from "zod";
import {
  BillingAccessLevel,
  FinanceResponsibility,
  FinancialAccessScope,
  WorkspaceRole,
} from "@prisma/client";
import { emailSchema } from "./common";

/**
 * Invitation creation schema
 */
export const createInvitationSchema = z.object({
  email: emailSchema,
  /** When false, invite is created but no email is sent; API returns inviteUrl for sharing. */
  sendEmail: z.boolean().optional().default(true),
  /** Role to assign on accept. Defaults to Member. */
  role: z.enum(["Owner", "Admin", "Finance", "Member"]).optional().default("Member"),
  /** 4-axis preset (doc 01 Section 4). Validated in POST handler via validate4AxisCombination. */
  workspaceRole: z.nativeEnum(WorkspaceRole).optional(),
  financialAccess: z.nativeEnum(FinancialAccessScope).optional(),
  financeResponsibility: z.nativeEnum(FinanceResponsibility).optional(),
  billingAccess: z.nativeEnum(BillingAccessLevel).optional(),
});

/**
 * Accept invitation schema
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(20, "Token must be at least 20 characters"),
});
