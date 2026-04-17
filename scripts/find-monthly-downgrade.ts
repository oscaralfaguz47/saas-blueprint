import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const subs = await prisma.subscription.findMany({
    where: {
      billingInterval: "monthly",
      pendingChangeType: "downgrade_end_of_period",
      pendingPlanCode: "starter",
    },
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
    orderBy: { id: "desc" },
  });

  console.log(
    `Found ${subs.length} monthly subscription(s) with downgrade_end_of_period and pending starter:`,
  );
  console.log(JSON.stringify(subs, null, 2));

  await prisma.$disconnect();
}
main().catch(console.error);
