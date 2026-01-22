import { prisma } from "@/server/db";
import type { RoleKey } from "@/types/next-auth";

export type VendorPermission =
  | "admin.tenants.read"
  | "admin.tenants.suspend"
  | "admin.users.read"
  | "admin.users.block"
  | "admin.sessions.revoke"
  | "admin.mfa.reset"
  | "admin.billing.read"
  | "admin.audit.read";

/**
 * Returns true if the user has the given vendor/platform permission.
 *
 * Source of truth:
 *  - VendorRole/VendorRolePermission/VendorUserRole (DB-driven RBAC)
 *
 * Transitional fallback:
 *  - legacyRole (User.role) mapping to avoid breaking behavior during migration.
 *
 * IMPORTANT:
 *  - Supports multiple vendor roles per user.
 *  - Honors User.isPlatformBlocked.
 */
export async function hasVendorPermission(params: {
  userId: string;
  legacyRole?: RoleKey;
  permission: VendorPermission;
}): Promise<boolean> {
  const { userId, legacyRole, permission } = params;

  // 0) Hard block (platform-level). Blocked users have no vendor permissions.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformBlocked: true },
  });

  if (!user || user.isPlatformBlocked) return false;

  // 1) Transitional fallback (remove once migration completes)
  // NOTE: Keep this mapping minimal and explicitly scoped.
  if (legacyRole === "ADMIN") return true;

  if (legacyRole === "MANAGER") {
    // Managers get a limited subset (adjust as needed)
    return (
      permission === "admin.tenants.read" ||
      permission === "admin.users.read" ||
      permission === "admin.sessions.revoke" ||
      permission === "admin.mfa.reset" ||
      permission === "admin.audit.read"
    );
  }

  // 2) DB-driven permissions: gather ALL roles for this user
  const rows = await prisma.vendorUserRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          permissions: {
            select: {
              permission: { select: { code: true } },
            },
          },
        },
      },
    },
  });

  if (rows.length === 0) return false;

  // 3) Flatten permission codes across roles and check membership
  for (const r of rows) {
    for (const rp of r.role.permissions) {
      if (rp.permission.code === permission) return true;
    }
  }

  return false;
}
