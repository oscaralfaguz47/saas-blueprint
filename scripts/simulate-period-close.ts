import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const subs = await prisma.subscription.findMany({
    where: {
      pendingChangeType: "downgrade_end_of_period",
    },
    select: {
      id: true,
      tenantId: true,
      providerSubscriptionId: true,
      billingInterval: true,
      pendingPlanCode: true,
      pendingBillingInterval: true,
      pendingChangeType: true,
      pendingEffectiveAt: true,
      currentPeriodEnd: true,
      plan: { select: { code: true } },
    },
  });

  console.log(`Found ${subs.length} subscription(s) with pending downgrade:`);
  for (const sub of subs) {
    const targetBillingInterval =
      sub.pendingBillingInterval === "annual" || sub.pendingBillingInterval === "monthly"
        ? sub.pendingBillingInterval
        : sub.billingInterval === "annual"
          ? "annual"
          : "monthly";

    console.log(`\nSubscription: ${sub.id.slice(-8)}`);
    console.log(`  Current plan: ${sub.plan?.code} (${sub.billingInterval})`);
    console.log(`  Target plan: ${sub.pendingPlanCode} (${targetBillingInterval})`);
    console.log(`  Effective at: ${sub.pendingEffectiveAt?.toISOString().slice(0, 10)}`);
    console.log(`  Period end: ${sub.currentPeriodEnd?.toISOString().slice(0, 10)}`);
    console.log(`  Would call updateSubscriptionPrice with:`);
    console.log(`    targetPlanCode: ${sub.pendingPlanCode}`);
    console.log(`    billingInterval: ${targetBillingInterval}`);
    console.log(`    effective: "next_period"`);

    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const periodEnd = sub.currentPeriodEnd;
    const isReady = periodEnd != null && periodEnd <= oneDayFromNow;
    const daysUntilWindow =
      periodEnd && periodEnd > oneDayFromNow
        ? Math.ceil((periodEnd.getTime() - oneDayFromNow.getTime()) / (1000 * 60 * 60 * 24))
        : null;
    console.log(
      `  Ready to apply: ${isReady ? "YES (within 24h window or past period end)" : daysUntilWindow != null ? `NO (${daysUntilWindow} days until window)` : "NO (no period end)"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
