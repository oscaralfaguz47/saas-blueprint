import "server-only";

import { cache } from "react";
import type {
  BillingAccessLevel,
  FinanceResponsibility,
  FinancialAccessScope,
  MembershipStatus,
  WorkspaceRole,
} from "@prisma/client";
import { prisma } from "@/server/db";

// ----- Types -----

export type Membership4Axis = {
  membershipId: string;
  status: MembershipStatus;
  workspaceRole: WorkspaceRole;
  financialAccess: FinancialAccessScope;
  financeResponsibility: FinanceResponsibility;
  billingAccess: BillingAccessLevel;
};

export type FinanceAccessAction =
  | "finance.records.view_all"
  | "finance.records.view_department"
  | "finance.records.view_own_and_participating"
  | "finance.records.process"
  | "finance.records.approve";

export type BillingAccessAction = "billing.view" | "billing.manage";

export type WorkspaceAccessAction = "workspace.admin" | "workspace.manage_members";

export type AccessAction =
  | FinanceAccessAction
  | BillingAccessAction
  | WorkspaceAccessAction;

export type AccessCombinationError =
  | "OWNER_FINANCIAL_ACCESS_CANNOT_BE_NONE"
  | "OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE"
  | "FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY"
  | "DEPARTMENT_SCOPE_WITHOUT_DEPARTMENTS"
  | null;

// ----- Cached loaders (per-request dedup via React cache — not unstable_cache) -----

/** True when the user row exists and is platform-blocked. Missing user → false. */
export const getUserPlatformBlocked = cache(
  async (userId: string): Promise<boolean> => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformBlocked: true },
    });
    return u?.isPlatformBlocked === true;
  }
);

/**
 * React `cache()` uses `Object.is` on arguments. A single object literal per call
 * would never hit — use primitive tuple (tenantId, userId) for correct dedup.
 */
const loadMembership4Axis = cache(
  async (tenantId: string, userId: string): Promise<Membership4Axis | null> => {
    const row = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        id: true,
        status: true,
        workspaceRole: true,
        financialAccess: true,
        financeResponsibility: true,
        billingAccess: true,
      },
    });

    if (!row || row.status !== "ACTIVE") return null;

    return {
      membershipId: row.id,
      status: row.status,
      workspaceRole: row.workspaceRole,
      financialAccess: row.financialAccess,
      financeResponsibility: row.financeResponsibility,
      billingAccess: row.billingAccess,
    };
  }
);

/** Load 4-axis membership data with React cache() for per-request dedup. */
export async function getMembership4Axis(params: {
  tenantId: string;
  userId: string;
}): Promise<Membership4Axis | null> {
  return loadMembership4Axis(params.tenantId, params.userId);
}

/** Resolve a 4-axis access decision. Returns boolean (no throw). */
export async function hasAccess(params: {
  tenantId: string;
  userId: string;
  action: AccessAction;
}): Promise<boolean> {
  if (await getUserPlatformBlocked(params.userId)) return false;

  const m = await getMembership4Axis({
    tenantId: params.tenantId,
    userId: params.userId,
  });
  if (!m) return false;

  switch (params.action) {
    case "finance.records.view_all":
    case "finance.records.view_department":
    case "finance.records.view_own_and_participating":
    case "finance.records.process":
    case "finance.records.approve":
      return canPerformFinanceAction(m, params.action);
    case "billing.view":
    case "billing.manage":
      return canPerformBillingAction(m, params.action);
    case "workspace.admin":
    case "workspace.manage_members":
      return canPerformWorkspaceAction(m, params.action);
    default: {
      const _exhaustive: never = params.action;
      return _exhaustive;
    }
  }
}

export function canPerformFinanceAction(
  membership: Membership4Axis,
  action: FinanceAccessAction
): boolean {
  switch (action) {
    case "finance.records.view_all":
      return membership.financialAccess === "ALL";
    case "finance.records.view_department":
      return (
        membership.financialAccess === "ALL" ||
        membership.financialAccess === "DEPARTMENT"
      );
    case "finance.records.view_own_and_participating":
      return membership.status === "ACTIVE";
    case "finance.records.process":
      return (
        membership.financeResponsibility === "PROCESS" ||
        membership.financeResponsibility === "PROCESS_AND_APPROVE"
      );
    case "finance.records.approve":
      return (
        membership.financeResponsibility === "APPROVE" ||
        membership.financeResponsibility === "PROCESS_AND_APPROVE"
      );
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function canPerformBillingAction(
  membership: Membership4Axis,
  action: BillingAccessAction
): boolean {
  switch (action) {
    case "billing.view":
      return (
        membership.billingAccess === "READ" ||
        membership.billingAccess === "MANAGE"
      );
    case "billing.manage":
      return membership.billingAccess === "MANAGE";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function canPerformWorkspaceAction(
  membership: Membership4Axis,
  action: WorkspaceAccessAction
): boolean {
  switch (action) {
    case "workspace.admin":
    case "workspace.manage_members":
      return (
        membership.workspaceRole === "OWNER" ||
        membership.workspaceRole === "ADMIN"
      );
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function validate4AxisCombination(params: {
  workspaceRole: WorkspaceRole;
  financialAccess: FinancialAccessScope;
  financeResponsibility: FinanceResponsibility;
  billingAccess: BillingAccessLevel;
  /** When set to 0 with DEPARTMENT scope, combination is invalid. Omit to skip this rule. */
  assignedDepartmentCount?: number;
}): AccessCombinationError {
  const {
    workspaceRole,
    financialAccess,
    financeResponsibility,
    assignedDepartmentCount,
  } = params;

  if (workspaceRole === "OWNER" && financialAccess === "NONE") {
    return "OWNER_FINANCIAL_ACCESS_CANNOT_BE_NONE";
  }

  if (
    workspaceRole === "OWNER" &&
    (financialAccess === "DEPARTMENT" ||
      financialAccess === "OWN_AND_PARTICIPATING")
  ) {
    return "OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE";
  }

  if (
    financialAccess === "NONE" &&
    (financeResponsibility === "PROCESS" ||
      financeResponsibility === "APPROVE" ||
      financeResponsibility === "PROCESS_AND_APPROVE")
  ) {
    return "FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY";
  }

  if (
    assignedDepartmentCount !== undefined &&
    assignedDepartmentCount === 0 &&
    financialAccess === "DEPARTMENT"
  ) {
    return "DEPARTMENT_SCOPE_WITHOUT_DEPARTMENTS";
  }

  return null;
}
