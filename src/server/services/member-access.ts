import "server-only";

import type { Prisma } from "@prisma/client";
import type {
  BillingAccessLevel,
  FinanceResponsibility,
  FinancialAccessScope,
  WorkspaceRole,
} from "@prisma/client";
import {
  validate4AxisCombination,
  type AccessCombinationError,
} from "@/server/security/access-model";

/** Non-null combination errors from `validate4AxisCombination`. */
export type AccessCombinationViolation = Exclude<AccessCombinationError, null>;

export type MemberAccessInvariantError =
  | AccessCombinationViolation
  | "AT_LEAST_ONE_OWNER_REQUIRES_BILLING_MANAGE"
  | "CANNOT_DEMOTE_LAST_OWNER";

export class MemberInvariantError extends Error {
  constructor(public readonly code: MemberAccessInvariantError) {
    super(code);
    this.name = "MemberInvariantError";
  }
}

export type Member4AxisPatch = Partial<{
  workspaceRole: WorkspaceRole;
  financialAccess: FinancialAccessScope;
  financeResponsibility: FinanceResponsibility;
  billingAccess: BillingAccessLevel;
}>;

/**
 * Checks structural 4-axis rules and tenant invariants for a PATCH.
 * Call inside a Serializable transaction after resolving tenant + membership id.
 */
export async function checkMemberAccessInvariants(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  membershipId: string;
  patch: Member4AxisPatch;
}): Promise<MemberAccessInvariantError | null> {
  const { tx, tenantId, membershipId, patch } = params;

  const current = await tx.tenantMembership.findFirst({
    where: { id: membershipId, tenantId },
    select: {
      status: true,
      workspaceRole: true,
      financialAccess: true,
      financeResponsibility: true,
      billingAccess: true,
    },
  });

  if (!current || current.status !== "ACTIVE") {
    throw new Error("MEMBERSHIP_STALE");
  }

  const merged = {
    workspaceRole: patch.workspaceRole ?? current.workspaceRole,
    financialAccess: patch.financialAccess ?? current.financialAccess,
    financeResponsibility:
      patch.financeResponsibility ?? current.financeResponsibility,
    billingAccess: patch.billingAccess ?? current.billingAccess,
  };

  const comboError = validate4AxisCombination({
    workspaceRole: merged.workspaceRole,
    financialAccess: merged.financialAccess,
    financeResponsibility: merged.financeResponsibility,
    billingAccess: merged.billingAccess,
    // TODO: pass assignedDepartmentCount once TenantMembershipDepartment exists (TD-C2-001).
  });
  if (comboError !== null) {
    return comboError;
  }

  const othersWithOwnerManage = await tx.tenantMembership.count({
    where: {
      tenantId,
      status: "ACTIVE",
      workspaceRole: "OWNER",
      billingAccess: "MANAGE",
      id: { not: membershipId },
    },
  });

  const thisContributesOwnerManage =
    merged.workspaceRole === "OWNER" && merged.billingAccess === "MANAGE";

  if (!thisContributesOwnerManage && othersWithOwnerManage === 0) {
    return "AT_LEAST_ONE_OWNER_REQUIRES_BILLING_MANAGE";
  }

  if (merged.workspaceRole !== "OWNER") {
    const otherOwners = await tx.tenantMembership.count({
      where: {
        tenantId,
        status: "ACTIVE",
        workspaceRole: "OWNER",
        id: { not: membershipId },
      },
    });
    if (otherOwners === 0) {
      return "CANNOT_DEMOTE_LAST_OWNER";
    }
  }

  return null;
}
