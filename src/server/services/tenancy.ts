import "server-only";

import { prisma } from "@/server/db";

const membershipSelect = {
  id: true,
  tenantId: true,
  tenant: { select: { id: true, name: true, slug: true, status: true, logoObjectKey: true } },
} as const;

/**
 * Returns the user's default workspace membership (including DRAFT) for layout/redirect logic.
 * A5: DRAFT tenants require redirect to /setup/workspace.
 *
 * When the current default is a DRAFT (e.g. created while the user was disabled), we prefer
 * any ACTIVE membership in an ACTIVE tenant (e.g. re-enabled workspace) and switch default
 * to it so the user is not forced to claim the DRAFT.
 */
export async function getDefaultTenantForUser(userId: string) {
  const current = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      isDefaultTenant: true,
      status: "ACTIVE",
      tenant: { status: { in: ["DRAFT", "ACTIVE"] } },
    },
    orderBy: { joinedAt: "desc" },
    select: membershipSelect,
  });

  if (!current) return null;

  if (current.tenant.status === "ACTIVE") return current;

  const activeTenantMembership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
      id: { not: current.id },
    },
    orderBy: { joinedAt: "desc" },
    select: membershipSelect,
  });

  if (!activeTenantMembership) return current;

  await prisma.$transaction([
    prisma.tenantMembership.updateMany({
      where: { userId },
      data: { isDefaultTenant: false },
    }),
    prisma.tenantMembership.update({
      where: { id: activeTenantMembership.id },
      data: { isDefaultTenant: true },
    }),
  ]);

  return activeTenantMembership;
}
