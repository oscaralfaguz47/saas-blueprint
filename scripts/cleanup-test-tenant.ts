import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const SUB_ID = "cmnv5i4rm001j7klkks0w97mb";

  await prisma.subscription.update({
    where: { id: SUB_ID },
    data: {
      // Clean active Scale monthly — no pending downgrade
      billingInterval: "monthly",
      billingPlanCode: "scale",
      currentEntitlementPlanCode: "scale",
      pendingPlanCode: null,
      pendingBillingInterval: null,
      pendingChangeType: null,
      pendingEffectiveAt: null,
      entitlementEffectiveUntil: null,
      currentPeriodStart: new Date("2026-04-12T02:34:58.324Z"),
      currentPeriodEnd: new Date("2026-05-12T02:34:58.324Z"),
      downgradePaddleAppliedAt: null,
      cancelAtPeriodEnd: false,
    },
  });

  const scalePlan = await prisma.plan.findFirst({
    where: { code: "scale", isActive: true },
    select: { id: true },
  });

  if (scalePlan) {
    await prisma.subscription.update({
      where: { id: SUB_ID },
      data: { planId: scalePlan.id },
    });
  }

  console.log("✅ Tenant cleaned up — Scale monthly, no pending downgrade.");
  await prisma.$disconnect();
}

main().catch(console.error);
