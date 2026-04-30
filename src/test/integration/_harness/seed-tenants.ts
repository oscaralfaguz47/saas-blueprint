import type { PrismaClient } from "@prisma/client";

export type TwoTenantSeed = {
  tenantA: { id: string; name: string; slug: string; status: string };
  tenantB: { id: string; name: string; slug: string; status: string };
  userA: { id: string; email: string | null };
  userB: { id: string; email: string | null };
  membershipA: { id: string; tenantId: string; userId: string };
  membershipB: { id: string; tenantId: string; userId: string };
};

/**
 * Two isolated workspaces with Primary Owner bootstrapping (roles, permissions, financial config).
 * Dynamic-imports tenancy bootstrap so this module can load before `setPrismaClient`.
 */
export async function seedTwoTenants(
  _prisma: PrismaClient
): Promise<TwoTenantSeed> {
  const { createTenantForUser } = await import(
    "@/server/services/tenancy-bootstrap"
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const userA = await _prisma.user.create({
    data: {
      email: `int-user-a-${suffix}@test.local`,
      name: "Integration User A",
    },
    select: { id: true, email: true },
  });
  const userB = await _prisma.user.create({
    data: {
      email: `int-user-b-${suffix}@test.local`,
      name: "Integration User B",
    },
    select: { id: true, email: true },
  });

  await _prisma.userSecurity.createMany({
    data: [
      { userId: userA.id, tokenVersion: 0 },
      { userId: userB.id, tokenVersion: 0 },
    ],
  });

  const { tenant: tA } = await createTenantForUser({
    userId: userA.id,
    slug: `int-ta-${suffix}`,
  });
  const { tenant: tB } = await createTenantForUser({
    userId: userB.id,
    slug: `int-tb-${suffix}`,
  });

  const membershipA = await _prisma.tenantMembership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: tA.id, userId: userA.id } },
    select: { id: true, tenantId: true, userId: true },
  });
  const membershipB = await _prisma.tenantMembership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: tB.id, userId: userB.id } },
    select: { id: true, tenantId: true, userId: true },
  });

  return {
    tenantA: tA,
    tenantB: tB,
    userA,
    userB,
    membershipA,
    membershipB,
  };
}
