import "server-only";

import { prisma } from "@/server/db";

export type TenantPermission =
  | "tenant.users.read"
  | "tenant.users.invite"
  | "tenant.users.manage"
  | "tenant.roles.manage"
  | "tenant.settings.manage"
  | "tenant.audit.read"
  | "tenant.billing.manage";

export async function hasTenantPermission(params: {
  userId: string;
  tenantId: string;
  permission: TenantPermission;
}): Promise<boolean> {
  const { userId, tenantId, permission } = params;

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: {
      status: true,
      roles: {
        select: {
          role: {
            select: {
              permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!membership || membership.status !== "ACTIVE") return false;

  const codes = new Set(
    membership.roles.flatMap((r) =>
      r.role.permissions.map((rp) => rp.permission.code)
    )
  );

  return codes.has(permission);
}
