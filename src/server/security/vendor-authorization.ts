import "server-only";

import { prisma } from "@/server/db";

export type VendorPermission =
  | "admin.tenants.read"
  | "admin.tenants.suspend"
  | "admin.users.read"
  | "admin.users.manage"
  | "admin.users.block"
  | "admin.sessions.revoke"
  | "admin.mfa.reset"
  | "admin.billing.read"
  | "admin.audit.read"
  | "admin.support.read"
  | "admin.support.reply"
  | "admin.support.manage"
  | "admin.knowledge_base.read"
  | "admin.knowledge_base.manage";

/**
 * Returns true if the user has the given vendor/platform permission.
 *
 * Source of truth: VendorRole/VendorRolePermission/VendorUserRole (DB-driven RBAC).
 *
 * IMPORTANT:
 *  - Supports multiple vendor roles per user.
 *  - Honors User.isPlatformBlocked.
 */
export async function hasVendorPermission(params: {
  userId: string;
  permission: VendorPermission;
}): Promise<boolean> {
  const { userId, permission } = params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformBlocked: true },
  });

  if (!user || user.isPlatformBlocked) return false;

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

  for (const r of rows) {
    for (const rp of r.role.permissions) {
      if (rp.permission.code === permission) return true;
    }
  }

  return false;
}
