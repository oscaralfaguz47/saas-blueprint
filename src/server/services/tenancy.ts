import "server-only";

import { prisma } from "@/server/db";

export async function getDefaultTenantForUser(userId: string) {
  return prisma.tenantMembership.findFirst({
    where: {
      userId,
      isDefaultTenant: true,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" }, 
    },
    orderBy: { joinedAt: "desc" }, // deterministic if bad data ever happens
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}
