import "server-only";

import { prisma } from "@/server/db";

/**
 * Returns the user's default workspace membership (including DRAFT) for layout/redirect logic.
 * A5: DRAFT tenants require redirect to /setup/workspace.
 */
export async function getDefaultTenantForUser(userId: string) {
  return prisma.tenantMembership.findFirst({
    where: {
      userId,
      isDefaultTenant: true,
      status: "ACTIVE",
      tenant: { status: { in: ["DRAFT", "ACTIVE"] } },
    },
    orderBy: { joinedAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true, logoObjectKey: true } },
    },
  });
}
