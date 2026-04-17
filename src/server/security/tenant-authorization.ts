import "server-only";

import { prisma } from "@/server/db";

/**
 * Tenant permission codes aligned with docs/epics/2-A2-Roles-And-Permissions.md
 * and docs/epics/00-NAMING-AND-PERMISSION-ALIGNMENT.md.
 */
export type TenantPermission =
  | "tenant.audit.read"
  | "tenant.billing.manage"
  | "tenant.financial_config.manage"
  | "tenant.settings.manage"
  | "tenant.roles.read"
  | "tenant.roles.manage"
  | "tenant.users.read"
  | "tenant.users.invite"
  | "tenant.users.manage"
  | "tenant.users.disable"
  | "tenant.requests.create"
  | "tenant.requests.read_all"
  | "tenant.requests.close"
  | "tenant.requests.share"
  | "tenant.requests.link"
  | "tenant.requests.export"
  | "tenant.requests.comment"
  | "tenant.evidence.add"
  | "tenant.evidence.remove"
  | "tenant.approvals.assign_internal"
  | "tenant.approvals.assign_external"
  | "tenant.approvals.remind"
  | "tenant.payments.manage"
  | "support.ticket.create"
  | "support.ticket.read_own"
  | "support.ticket.read_workspace"
  | "support.ticket.reply_own"
  | "support.ticket.reply_workspace";

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

/** Return all permission codes for the user in the tenant (for UI gating). */
export async function getTenantPermissions(params: {
  userId: string;
  tenantId: string;
}): Promise<string[]> {
  const { userId, tenantId } = params;

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

  if (!membership || membership.status !== "ACTIVE") return [];

  return Array.from(
    new Set(
      membership.roles.flatMap((r) =>
        r.role.permissions.map((rp) => rp.permission.code)
      )
    )
  );
}
