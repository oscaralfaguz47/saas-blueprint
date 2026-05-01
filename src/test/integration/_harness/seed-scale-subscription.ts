import type { PrismaClient } from "@prisma/client";

/**
 * Minimum subscription row so `resolveEffectiveSubscription` + `resolveTenantPlan` treat the tenant as **scale**
 * (catalog `assignmentEngine: true`, full approval routing). See `resolve-tenant-plan.ts` + `plans/catalog.ts`.
 */
export async function seedScaleSubscription(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  const plan = await prisma.plan.upsert({
    where: { code: "scale" },
    create: {
      code: "scale",
      name: "Scale",
      isActive: true,
    },
    update: {},
    select: { id: true },
  });

  await prisma.subscription.upsert({
    where: { tenantId_provider: { tenantId, provider: "paddle" } },
    create: {
      tenantId,
      planId: plan.id,
      provider: "paddle",
      status: "ACTIVE",
      billingInterval: "monthly",
    },
    update: {
      planId: plan.id,
      status: "ACTIVE",
    },
  });
}
