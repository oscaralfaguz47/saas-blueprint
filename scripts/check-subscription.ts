/**
 * List recent Subscription rows (billing interval, pending downgrade). Requires DATABASE_URL.
 * Usage: npx tsx scripts/check-subscription.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const subs = await prisma.subscription.findMany({
    select: {
      id: true,
      tenantId: true,
      billingInterval: true,
      billingPlanCode: true,
      currentEntitlementPlanCode: true,
      pendingPlanCode: true,
      pendingBillingInterval: true,
      pendingChangeType: true,
      pendingEffectiveAt: true,
      entitlementEffectiveUntil: true,
      currentPeriodEnd: true,
      plan: { select: { code: true } },
      status: true,
    },
    orderBy: { id: "desc" },
    take: 3,
  });
  console.table(
    subs.map((s) => ({
      plan: s.plan?.code,
      billingInterval: s.billingInterval,
      pendingPlan: s.pendingPlanCode,
      pendingInterval: s.pendingBillingInterval,
      pendingType: s.pendingChangeType,
      effectiveUntil: s.entitlementEffectiveUntil?.toISOString().slice(0, 10),
      periodEnd: s.currentPeriodEnd?.toISOString().slice(0, 10),
    })),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
