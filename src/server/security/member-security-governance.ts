import "server-only";

import {
  canManageTargetByRole,
  getHighestRoleName,
  isOwnerLevel,
  onlyPrimaryOwnerCanChangeOwnerLevel,
} from "@/server/security/authority";
import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { prisma } from "@/server/db";

/** E6: Member security actions; used for governance constraint checks. */
export type MemberSecurityAction =
  | "force-2fa"
  | "reset-2fa"
  | "disable-2fa"
  | "revoke-sessions"
  | "revoke-remembered-devices";

/** E6: Resolved context for member security operations (actor and target in same tenant). */
export type MemberSecurityContext = {
  actorRole: string;
  targetRole: string;
  targetMembershipId: string;
};

/**
 * E6: Resolve whether 2FA is enforced for the user by ANY workspace where they are ACTIVE.
 * Disabled members are not required to set up 2FA for workspaces they are disabled from.
 * Used for login/session: if true and totpEnabled is false, user must complete setup at /auth/setup-2fa.
 */
export async function isMfaEnforcedForUser(userId: string): Promise<boolean> {
  const row = await prisma.workspaceMemberSecurity.findFirst({
    where: {
      userId,
      mfaEnforced: true,
      tenant: {
        memberships: {
          some: {
            userId,
            status: "ACTIVE",
          },
        },
      },
    },
    select: { id: true },
  });
  return row != null;
}

/** Count ACTIVE memberships with Owner-level role (Primary Owner or Owner) in tenant. */
export async function getOwnerLevelCount(tenantId: string): Promise<number> {
  const roles = await prisma.tenantRole.findMany({
    where: {
      tenantId,
      name: { in: ["Primary Owner", "Owner"] },
    },
    select: { id: true },
  });
  if (roles.length === 0) return 0;
  return prisma.tenantUserRole.count({
    where: {
      roleId: { in: roles.map((r) => r.id) },
      membership: { tenantId, status: "ACTIVE" },
    },
  });
}

/**
 * E6: Actor can manage target's security only if rank(actor) > rank(target),
 * and only Primary Owner can manage Owner-level members.
 * Self-targeting is not allowed (caller must check actorUserId !== targetUserId).
 */
export function canManageMemberSecurity(
  actorRoleName: string,
  targetRoleName: string
): boolean {
  if (isOwnerLevel(targetRoleName)) {
    return onlyPrimaryOwnerCanChangeOwnerLevel(actorRoleName);
  }
  return canManageTargetByRole(actorRoleName, targetRoleName);
}

/**
 * E6: Resolve actor and target memberships/roles in tenant.
 * Returns null if either membership not found (404) or target not in tenant.
 */
export async function getMemberSecurityContext(
  tenantId: string,
  actorUserId: string,
  targetUserId: string
): Promise<MemberSecurityContext | null> {
  const [actorMembership, targetMembership] = await Promise.all([
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: actorUserId } },
      select: {
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      select: {
        id: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
  ]);
  if (!actorMembership || !targetMembership) return null;
  const actorRole =
    getHighestRoleName(actorMembership.roles.map((r) => r.role.name)) ?? "Member";
  const targetRole =
    getHighestRoleName(targetMembership.roles.map((r) => r.role.name)) ?? "Member";
  return {
    actorRole,
    targetRole,
    targetMembershipId: targetMembership.id,
  };
}

/**
 * E6: Assert governance constraints before performing member security action.
 * - Exactly one Primary Owner must exist (we are not changing membership here).
 * - At least one Owner-level must exist.
 * - Cannot reset/disable 2FA of the last active Owner-level user (policy requires enforcement).
 * Throws with GOVERNANCE_CONSTRAINT_VIOLATION message; caller should map to ApiErrors.GOVERNANCE_CONSTRAINT_VIOLATION.
 */
export async function assertGovernanceConstraints(
  tenantId: string,
  targetUserId: string,
  targetRole: string,
  action: MemberSecurityAction
): Promise<void> {
  const ownerLevelCount = await getOwnerLevelCount(tenantId);
  const targetIsOwnerLevel = isOwnerLevel(targetRole);
  const isLastOwnerLevel = targetIsOwnerLevel && ownerLevelCount <= 1;

  if (
    (action === "reset-2fa" || action === "disable-2fa") &&
    isLastOwnerLevel
  ) {
    throw new Error(
      "Cannot reset or disable 2FA for the last Owner-level user; workspace governance requires at least one."
    );
  }
}

/** E6: Rate limit — 5 requests per minute per actor for member security endpoints. */
export async function checkMemberSecurityRateLimit(
  actorUserId: string
): Promise<RateLimitResult> {
  return checkRateLimit(`member:security:${actorUserId}`, 5, 60_000);
}
