import "server-only";

import {
  TENANT_SYSTEM_ROLE_NAMES,
  type TenantSystemRoleName,
} from "@/lib/tenant-role-permissions";

/**
 * A2 authority: role hierarchy for user/role management.
 * Primary Owner (5) > Owner (4) > Admin (3) > Finance (2) > Member (1).
 * Used for role changes, disable/enable, and governance constraints.
 */
const ROLE_RANK: Record<string, number> = {
  "Primary Owner": 5,
  Owner: 4,
  Admin: 3,
  Finance: 2,
  Member: 1,
};

export function getRoleRank(roleName: string): number {
  return ROLE_RANK[roleName] ?? 0;
}

/** Owner-level = Primary Owner or Owner; at least one must exist per workspace. */
export function isOwnerLevel(roleName: string): boolean {
  return roleName === "Primary Owner" || roleName === "Owner";
}

/**
 * Actor can manage (change role / disable) target only if actor's rank is strictly greater.
 * Authority rules per A2: rank(A) > rank(T).
 */
export function canManageTargetByRole(
  actorRoleName: string,
  targetRoleName: string
): boolean {
  const actorRank = getRoleRank(actorRoleName);
  const targetRank = getRoleRank(targetRoleName);
  return actorRank > targetRank;
}

/**
 * Only Primary Owner can promote to or demote from Owner-level roles.
 * Use when the requested role is "Owner" or when removing Owner from the target.
 */
export function onlyPrimaryOwnerCanChangeOwnerLevel(actorRoleName: string): boolean {
  return actorRoleName === "Primary Owner";
}

/**
 * Given a list of role names (e.g. from a membership), return the highest-ranked role name.
 * Used to derive "effective" role for authority checks when a user has a single role.
 */
export function getHighestRoleName(roleNames: string[]): string | null {
  if (roleNames.length === 0) return null;
  let best: string | null = null;
  let bestRank = 0;
  for (const name of roleNames) {
    const r = getRoleRank(name);
    if (r > bestRank) {
      bestRank = r;
      best = name;
    }
  }
  return best;
}

/** Type guard for known system roles. */
export function isTenantSystemRoleName(name: string): name is TenantSystemRoleName {
  return (TENANT_SYSTEM_ROLE_NAMES as readonly string[]).includes(name);
}
