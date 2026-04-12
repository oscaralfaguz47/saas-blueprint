import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Baseline from Script 0 (check-tenant-sub) before period-close test. */
async function main() {
  const SUB_ID = "cmnv61oj1004i7klkdqcfibsf";
  const PERIOD_END = new Date("2026-05-12T02:50:10.157Z");
  const PERIOD_START = new Date("2026-04-12T02:50:10.157Z");

  const scalePlan = await prisma.plan.findFirst({
    where: { code: "scale", isActive: true },
    select: { id: true },
  });
  if (!scalePlan) {
    console.error("No active scale plan");
    process.exit(1);
  }

  await prisma.subscription.update({
    where: { id: SUB_ID },
    data: {
      planId: scalePlan.id,
      billingInterval: "monthly",
      billingPlanCode: "starter",
      currentEntitlementPlanCode: "scale",
      pendingPlanCode: "starter",
      pendingBillingInterval: "annual",
      pendingChangeType: "downgrade_end_of_period",
      pendingEffectiveAt: PERIOD_END,
      entitlementEffectiveUntil: PERIOD_END,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      downgradePaddleAppliedAt: null,
    },
  });

  console.log("✅ Restored subscription to Script 0 baseline.");
  await prisma.$disconnect();
}

main().catch(console.error);
