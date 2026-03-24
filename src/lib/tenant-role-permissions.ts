import type { PrismaClient } from "@prisma/client";

/** A2 system role names (workspace). */
export const TENANT_SYSTEM_ROLE_NAMES = [
  "Primary Owner",
  "Owner",
  "Admin",
  "Finance",
  "Member",
] as const;

export type TenantSystemRoleName = (typeof TENANT_SYSTEM_ROLE_NAMES)[number];

/**
 * Role → permission codes. Single source of truth for A2 (docs/epics/2-A2-Roles-And-Permissions.md).
 * Used by tenancy-bootstrap and by the sync script (no server-only here).
 * Owner has the same permissions as Primary Owner; the difference is authority only (who can manage Owners / transfer Primary Ownership).
 */
export const ROLE_PERMS: Record<TenantSystemRoleName, string[]> = {
  "Primary Owner": [
    "tenant.audit.read",
    "tenant.billing.manage",
    "tenant.settings.manage",
    "tenant.roles.read",
    "tenant.roles.manage",
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.manage",
    "tenant.users.disable",
    "tenant.requests.create",
    "tenant.requests.read_all",
    "tenant.requests.close",
    "tenant.requests.share",
    "tenant.requests.link",
    "tenant.requests.export",
    "tenant.requests.comment",
    "tenant.evidence.add",
    "tenant.approvals.assign_internal",
    "tenant.approvals.assign_external",
    "tenant.approvals.remind",
    "tenant.payments.manage",
    "support.ticket.create",
    "support.ticket.read_workspace",
    "support.ticket.reply_workspace",
  ],
  Owner: [
    "tenant.audit.read",
    "tenant.billing.manage",
    "tenant.settings.manage",
    "tenant.roles.read",
    "tenant.roles.manage",
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.manage",
    "tenant.users.disable",
    "tenant.requests.create",
    "tenant.requests.read_all",
    "tenant.requests.close",
    "tenant.requests.share",
    "tenant.requests.link",
    "tenant.requests.export",
    "tenant.requests.comment",
    "tenant.evidence.add",
    "tenant.approvals.assign_internal",
    "tenant.approvals.assign_external",
    "tenant.approvals.remind",
    "tenant.payments.manage",
    "support.ticket.create",
    "support.ticket.read_workspace",
    "support.ticket.reply_workspace",
  ],
  Admin: [
    "tenant.audit.read",
    "tenant.settings.manage",
    "tenant.roles.read",
    "tenant.roles.manage",
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.manage",
    "tenant.users.disable",
    "tenant.requests.create",
    "tenant.requests.read_all",
    "tenant.requests.close",
    "tenant.requests.share",
    "tenant.requests.link",
    "tenant.requests.export",
    "tenant.requests.comment",
    "tenant.evidence.add",
    "tenant.approvals.assign_internal",
    "tenant.approvals.assign_external",
    "tenant.approvals.remind",
    "tenant.payments.manage",
    "support.ticket.create",
    "support.ticket.read_workspace",
    "support.ticket.reply_workspace",
  ],
  Finance: [
    "tenant.audit.read",
    "tenant.settings.manage",
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.manage",
    "tenant.users.disable",
    "tenant.requests.create",
    "tenant.requests.read_all",
    "tenant.requests.close",
    "tenant.requests.share",
    "tenant.requests.link",
    "tenant.requests.export",
    "tenant.requests.comment",
    "tenant.evidence.add",
    "tenant.approvals.assign_internal",
    "tenant.approvals.assign_external",
    "tenant.approvals.remind",
    "tenant.payments.manage",
    "support.ticket.create",
    "support.ticket.read_own",
    "support.ticket.reply_own",
  ],
  Member: [
    "tenant.requests.create",
    "tenant.requests.share",
    "tenant.requests.link",
    "tenant.requests.comment",
    "tenant.evidence.add",
    "support.ticket.create",
    "support.ticket.read_own",
    "support.ticket.reply_own",
  ],
};

/**
 * Ensure role-permission links for one tenant. Idempotent (createMany skipDuplicates).
 * Callable from server (tenancy-bootstrap) or from standalone scripts (no server-only).
 */
export async function ensureTenantRolesAndPermissionsWithPrisma(
  prisma: PrismaClient,
  params: { tenantId: string }
): Promise<void> {
  const { tenantId } = params;

  const roles = await prisma.tenantRole.findMany({
    where: { tenantId, name: { in: [...TENANT_SYSTEM_ROLE_NAMES] } },
    select: { id: true, name: true },
  });

  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
  if (!roleIdByName.get("Owner") && !roleIdByName.get("Primary Owner")) return;

  const neededCodes = Array.from(new Set(Object.values(ROLE_PERMS).flatMap((arr) => arr)));
  const perms = await prisma.permission.findMany({
    where: { code: { in: neededCodes } },
    select: { id: true, code: true },
  });
  const permIdByCode = new Map(perms.map((p) => [p.code, p.id]));

  const joinRows: Array<{ roleId: string; permissionId: string }> = [];
  for (const [roleName, codes] of Object.entries(ROLE_PERMS) as Array<
    [keyof typeof ROLE_PERMS, string[]]
  >) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) continue;
    for (const code of codes) {
      const permissionId = permIdByCode.get(code);
      if (!permissionId) continue;
      joinRows.push({ roleId, permissionId });
    }
  }

  if (joinRows.length === 0) return;

  await prisma.tenantRolePermission.createMany({
    data: joinRows,
    skipDuplicates: true,
  });
}
