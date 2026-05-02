import "server-only";

import type { Prisma } from "@prisma/client";
import type {
  BillingAccessLevel,
  FinanceResponsibility,
  FinancialAccessScope,
  WorkspaceRole,
} from "@prisma/client";
import {
  canManageTargetByRole,
  getHighestRoleName,
  getRoleRank,
  isOwnerLevel,
  onlyPrimaryOwnerCanChangeOwnerLevel,
} from "@/server/security/authority";
import {
  checkMemberAccessInvariants,
  MemberInvariantError,
  type Member4AxisPatch,
} from "@/server/services/member-access";

/** Assignable legacy workspace roles (not Primary Owner). */
const LEGACY_ASSIGNABLE_ROLE_NAMES = ["Owner", "Admin", "Finance", "Member"] as const;
export type LegacyAssignableRoleName = (typeof LEGACY_ASSIGNABLE_ROLE_NAMES)[number];

export type MemberAccessUpdatePatch = {
  workspaceRole?: WorkspaceRole;
  financialAccess?: FinancialAccessScope;
  financeResponsibility?: FinanceResponsibility;
  billingAccess?: BillingAccessLevel;
  role?: LegacyAssignableRoleName;
};

export type MemberAccessState = {
  workspaceRole: WorkspaceRole;
  financialAccess: FinancialAccessScope;
  financeResponsibility: FinanceResponsibility;
  billingAccess: BillingAccessLevel;
  role: string;
};

export type MemberAccessUpdateResult = {
  membershipId: string;
  userId: string;
  before: MemberAccessState;
  after: MemberAccessState;
  fieldsChanged: string[];
};

/** Structured error for route handlers to map to HTTP responses. */
export class MemberAccessUpdateError extends Error {
  constructor(
    public readonly httpStatus: 400 | 403 | 404 | 409,
    message: string,
    public readonly details?: { code?: string }
  ) {
    super(message);
    this.name = "MemberAccessUpdateError";
  }
}

export type MemberAccessUpdateParams = {
  tx: Prisma.TransactionClient;
  tenantId: string;
  membershipId: string;
  actorUserId: string;
  patch: MemberAccessUpdatePatch;
  ipAddress: string | null;
  userAgent: string | null;
};

async function getOwnerLevelCountTx(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<number> {
  const roles = await tx.tenantRole.findMany({
    where: {
      tenantId,
      name: { in: ["Primary Owner", "Owner"] },
    },
    select: { id: true },
  });
  if (roles.length === 0) return 0;
  return tx.tenantUserRole.count({
    where: {
      roleId: { in: roles.map((r) => r.id) },
      membership: { tenantId, status: "ACTIVE" },
    },
  });
}

/**
 * D-1a: Unified member access update (4-axis + optional legacy TenantUserRole) in one transaction.
 *
 * 1. Load ACTIVE target membership (404 if missing/inactive).
 * 2. Forbid self-target (403).
 * 3. Derive legacy display role and Primary Owner flag.
 * 4. Primary Owner + any 4-axis field → 400 PRIMARY_OWNER_AXIS_LOCKED.
 * 5. Primary Owner + legacy role in patch → 400 USE_TRANSFER_PRIMARY_OWNERSHIP.
 * 6. Load actor membership; hierarchy: canManageTargetByRole → else 403 MEMBER_ACCESS_HIERARCHY.
 * 7. If patch.role set: owner-level guards, rank vs new role, last owner-level count (legacy parity).
 * 8. checkMemberAccessInvariants (4-axis patch only).
 * 9. Update TenantMembership 4-axis columns if changed.
 * 10. Replace TenantUserRole row if legacy role changed.
 * 11. auditLog.create tenant.member.access_updated with full before/after.
 * 12. Return result.
 */
export async function updateMemberAccessInTransaction(
  params: MemberAccessUpdateParams
): Promise<MemberAccessUpdateResult> {
  const { tx, tenantId, membershipId, actorUserId, patch, ipAddress, userAgent } = params;

  const target = await tx.tenantMembership.findFirst({
    where: { id: membershipId, tenantId, status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      workspaceRole: true,
      financialAccess: true,
      financeResponsibility: true,
      billingAccess: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  if (!target) {
    throw new MemberAccessUpdateError(404, "Member");
  }

  if (target.userId === actorUserId) {
    throw new MemberAccessUpdateError(403, "Insufficient permissions");
  }

  const targetRoleNames = target.roles.map((r) => r.role.name);
  const currentLegacyRole = getHighestRoleName(targetRoleNames) ?? "Member";
  const isPrimaryOwner = target.roles.some((r) => r.role.name === "Primary Owner");

  const patchTouchesAxis =
    patch.workspaceRole !== undefined ||
    patch.financialAccess !== undefined ||
    patch.financeResponsibility !== undefined ||
    patch.billingAccess !== undefined;
  const hasRoleField = patch.role !== undefined;

  if (isPrimaryOwner && patchTouchesAxis) {
    throw new MemberAccessUpdateError(
      400,
      "Primary Owner access must be changed via the primary owner transfer flow.",
      { code: "PRIMARY_OWNER_AXIS_LOCKED" }
    );
  }

  if (isPrimaryOwner && hasRoleField) {
    throw new MemberAccessUpdateError(
      400,
      "Use transfer primary ownership to change the primary owner.",
      { code: "USE_TRANSFER_PRIMARY_OWNERSHIP" }
    );
  }

  const actorMembership = await tx.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId: actorUserId } },
    select: {
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  if (!actorMembership) {
    throw new MemberAccessUpdateError(404, "Member");
  }

  const actorRoleNames = actorMembership.roles.map((r) => r.role.name);
  const actorRole = getHighestRoleName(actorRoleNames) ?? "Member";

  if (!canManageTargetByRole(actorRole, currentLegacyRole)) {
    throw new MemberAccessUpdateError(403, "Insufficient permissions", {
      code: "MEMBER_ACCESS_HIERARCHY",
    });
  }

  if (hasRoleField && patch.role !== undefined) {
    const newRoleName = patch.role;
    const isOwnerLevelChange =
      newRoleName === "Owner" || isOwnerLevel(currentLegacyRole);
    if (isOwnerLevelChange && !onlyPrimaryOwnerCanChangeOwnerLevel(actorRole)) {
      throw new MemberAccessUpdateError(403, "Insufficient permissions");
    }

    if (getRoleRank(actorRole) <= getRoleRank(newRoleName)) {
      throw new MemberAccessUpdateError(403, "Insufficient permissions");
    }

    const actorIsPrimaryOwner = actorRole === "Primary Owner";
    if (!actorIsPrimaryOwner) {
      const ownerLevelCount = await getOwnerLevelCountTx(tx, tenantId);
      const targetHadOwnerLevel = isOwnerLevel(currentLegacyRole);
      const willAddOwner = newRoleName === "Owner";
      const ownerLevelAfter =
        ownerLevelCount - (targetHadOwnerLevel ? 1 : 0) + (willAddOwner ? 1 : 0);
      if (ownerLevelAfter < 1) {
        throw new MemberAccessUpdateError(
          400,
          "At least one owner-level user must remain."
        );
      }
    }
  }

  const axisPatch: Member4AxisPatch = {};
  if (patch.workspaceRole !== undefined) axisPatch.workspaceRole = patch.workspaceRole;
  if (patch.financialAccess !== undefined) axisPatch.financialAccess = patch.financialAccess;
  if (patch.financeResponsibility !== undefined) {
    axisPatch.financeResponsibility = patch.financeResponsibility;
  }
  if (patch.billingAccess !== undefined) axisPatch.billingAccess = patch.billingAccess;

  const invariant = await checkMemberAccessInvariants({
    tx,
    tenantId,
    membershipId,
    patch: axisPatch,
  });
  if (invariant !== null) {
    throw new MemberInvariantError(invariant);
  }

  const before: MemberAccessState = {
    workspaceRole: target.workspaceRole,
    financialAccess: target.financialAccess,
    financeResponsibility: target.financeResponsibility,
    billingAccess: target.billingAccess,
    role: currentLegacyRole,
  };

  const afterWorkspaceRole = patch.workspaceRole ?? target.workspaceRole;
  const afterFinancialAccess = patch.financialAccess ?? target.financialAccess;
  const afterFinanceResponsibility =
    patch.financeResponsibility ?? target.financeResponsibility;
  const afterBillingAccess = patch.billingAccess ?? target.billingAccess;

  let afterLegacyRole = currentLegacyRole;
  if (hasRoleField && patch.role !== undefined && patch.role !== currentLegacyRole) {
    afterLegacyRole = patch.role;
  }

  const fieldsChanged: string[] = [];
  if (
    patch.workspaceRole !== undefined &&
    patch.workspaceRole !== target.workspaceRole
  ) {
    fieldsChanged.push("workspaceRole");
  }
  if (
    patch.financialAccess !== undefined &&
    patch.financialAccess !== target.financialAccess
  ) {
    fieldsChanged.push("financialAccess");
  }
  if (
    patch.financeResponsibility !== undefined &&
    patch.financeResponsibility !== target.financeResponsibility
  ) {
    fieldsChanged.push("financeResponsibility");
  }
  if (patch.billingAccess !== undefined && patch.billingAccess !== target.billingAccess) {
    fieldsChanged.push("billingAccess");
  }
  if (hasRoleField && patch.role !== undefined && patch.role !== currentLegacyRole) {
    fieldsChanged.push("role");
  }

  if (fieldsChanged.length === 0) {
    return {
      membershipId,
      userId: target.userId,
      before,
      after: before,
      fieldsChanged: [],
    };
  }

  const updateData: Prisma.TenantMembershipUpdateInput = {};
  if (
    patch.workspaceRole !== undefined &&
    patch.workspaceRole !== target.workspaceRole
  ) {
    updateData.workspaceRole = patch.workspaceRole;
  }
  if (
    patch.financialAccess !== undefined &&
    patch.financialAccess !== target.financialAccess
  ) {
    updateData.financialAccess = patch.financialAccess;
  }
  if (
    patch.financeResponsibility !== undefined &&
    patch.financeResponsibility !== target.financeResponsibility
  ) {
    updateData.financeResponsibility = patch.financeResponsibility;
  }
  if (
    patch.billingAccess !== undefined &&
    patch.billingAccess !== target.billingAccess
  ) {
    updateData.billingAccess = patch.billingAccess;
  }

  if (Object.keys(updateData).length > 0) {
    await tx.tenantMembership.update({
      where: { id: membershipId },
      data: updateData,
    });
  }

  if (
    hasRoleField &&
    patch.role !== undefined &&
    patch.role !== currentLegacyRole
  ) {
    const roles = await tx.tenantRole.findMany({
      where: { tenantId, name: { in: [...LEGACY_ASSIGNABLE_ROLE_NAMES] } },
      select: { id: true, name: true },
    });
    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const newRoleId = roleIdByName.get(patch.role);
    if (!newRoleId) {
      throw new MemberAccessUpdateError(400, "Invalid role.");
    }

    await tx.tenantUserRole.deleteMany({
      where: { membershipId },
    });
    await tx.tenantUserRole.create({
      data: { membershipId, roleId: newRoleId },
    });
  }

  const after: MemberAccessState = {
    workspaceRole: afterWorkspaceRole,
    financialAccess: afterFinancialAccess,
    financeResponsibility: afterFinanceResponsibility,
    billingAccess: afterBillingAccess,
    role: afterLegacyRole,
  };

  await tx.auditLog.create({
    data: {
      actorUserId: actorUserId,
      actorContext: "TENANT",
      tenantId,
      action: "tenant.member.access_updated",
      targetType: "TenantMembership",
      targetId: membershipId,
      targetUserId: target.userId,
      metadata: {
        membershipId,
        before: {
          workspaceRole: before.workspaceRole,
          financialAccess: before.financialAccess,
          financeResponsibility: before.financeResponsibility,
          billingAccess: before.billingAccess,
          role: before.role,
        },
        after: {
          workspaceRole: after.workspaceRole,
          financialAccess: after.financialAccess,
          financeResponsibility: after.financeResponsibility,
          billingAccess: after.billingAccess,
          role: after.role,
        },
        fieldsChanged,
      },
      ipAddress,
      userAgent,
    },
  });

  return {
    membershipId,
    userId: target.userId,
    before,
    after,
    fieldsChanged,
  };
}
