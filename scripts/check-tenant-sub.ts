import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const TENANT_ID = "cmnxntciw005c7kxcz1n162y7";

  const sub = await prisma.subscription.findFirst({
    where: { tenantId: TENANT_ID, provider: "paddle" },
    select: {
      id: true,
      tenantId: true,
      providerSubscriptionId: true,
      billingInterval: true,
      billingPlanCode: true,
      currentEntitlementPlanCode: true,
      pendingPlanCode: true,
      pendingBillingInterval: true,
      pendingChangeType: true,
      pendingEffectiveAt: true,
      entitlementEffectiveUntil: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      downgradePaddleAppliedAt: true,
      status: true,
      plan: { select: { code: true } },
    },
  });

  console.log("=== SUBSCRIPTION STATE ===");
  console.log(JSON.stringify(sub, null, 2));

  await prisma.$disconnect();
}
main().catch(console.error);
