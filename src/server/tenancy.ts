import { prisma } from "@/server/db";

export async function getDefaultTenantForUser(userId: string) {
  return prisma.tenantMembership.findFirst({
    where: { userId, isDefaultTenant: true, status: "ACTIVE" },
    select: {
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}
