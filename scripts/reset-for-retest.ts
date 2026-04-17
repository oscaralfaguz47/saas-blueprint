import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const SUB_ID = "cmnv4s2hw00kv7ka8grc4uo2o";

  await prisma.subscription.update({
    where: { id: SUB_ID },
    data: {
      billingInterval: "monthly",
      billingPlanCode: "starter",
      currentEntitlementPlanCode: "pro",
      pendingPlanCode: "starter",
      pendingBillingInterval: "annual",
      pendingChangeType: "downgrade_end_of_period",
      pendingEffectiveAt: new Date("2026-05-12T02:14:42.262Z"),
      entitlementEffectiveUntil: new Date("2026-05-12T02:14:42.262Z"),
      currentPeriodStart: new Date("2026-04-12T02:14:42.262Z"),
      currentPeriodEnd: new Date("2026-05-12T02:14:42.262Z"),
      downgradePaddleAppliedAt: null,
    },
  });

  console.log("✅ reset-for-retest: subscription row updated.");
  await prisma.$disconnect();
}

main().catch(console.error);
