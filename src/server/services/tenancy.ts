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
 * - When the current default is DISABLED (e.g. user was disabled from that workspace), we
 *   prefer any ACTIVE membership in an ACTIVE tenant and switch default to it.
 * - When the current default is a DRAFT (e.g. created while the user was disabled), we
 *   prefer any ACTIVE membership in an ACTIVE tenant and switch default to it.
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

  // No valid default (e.g. default is DISABLED or user has no default): try to pick an ACTIVE workspace.
  if (!current) {
    const fallback = await prisma.tenantMembership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
      },
      orderBy: { joinedAt: "desc" },
      select: membershipSelect,
    });
    if (!fallback) return null;
    await prisma.$transaction([
      prisma.tenantMembership.updateMany({
        where: { userId },
        data: { isDefaultTenant: false },
      }),
      prisma.tenantMembership.update({
        where: { id: fallback.id },
        data: { isDefaultTenant: true },
      }),
    ]);
    return fallback;
  }

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
