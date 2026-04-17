import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const SUB_ID = "cmnv6j64q00a27klkc2pzmdcl";

  const sub = await prisma.subscription.findUnique({
    where: { id: SUB_ID },
    select: {
      tenantId: true,
      pendingPlanCode: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!sub) {
    console.error("Subscription not found:", SUB_ID);
    process.exit(1);
  }

  const isCancelToFree =
    sub.cancelAtPeriodEnd === true &&
    sub.pendingPlanCode?.toLowerCase() === "free";

  if (isCancelToFree) {
    // applyPendingPlanCodeIfNeeded runs only after an OPEN TenantBillingState with periodEnd < now
    // is closed. Align subscription period end with that meter period so currentPeriodEnd <= state.periodEnd.
    const periodEndAlign = new Date(Date.now() - 30 * 60 * 1000);
    const periodStartAlign = new Date(periodEndAlign.getTime() - 7 * 24 * 60 * 60 * 1000);

    await prisma.tenantBillingState.deleteMany({
      where: { tenantId: sub.tenantId, status: "OPEN" },
    });

    await prisma.tenantBillingState.create({
      data: {
        tenantId: sub.tenantId,
        periodStart: periodStartAlign,
        periodEnd: periodEndAlign,
        status: "OPEN",
        planCode: "pro",
        rolloverRequests: 0,
      },
    });

    await prisma.subscription.update({
      where: { id: SUB_ID },
      data: {
        currentPeriodStart: periodStartAlign,
        currentPeriodEnd: periodEndAlign,
        pendingEffectiveAt: periodEndAlign,
        entitlementEffectiveUntil: periodEndAlign,
      },
    });

    console.log(
      `✅ Cancel-to-free setup: synthetic OPEN billing state ended ${periodEndAlign.toISOString()}; subscription period aligned.`,
    );
    await prisma.$disconnect();
    return;
  }

  const twelveHoursFromNow = new Date(Date.now() + 12 * 60 * 60 * 1000);
  console.log(`Setting currentPeriodEnd to: ${twelveHoursFromNow.toISOString()}`);

  await prisma.subscription.update({
    where: { id: SUB_ID },
    data: {
      currentPeriodEnd: twelveHoursFromNow,
      pendingEffectiveAt: twelveHoursFromNow,
      entitlementEffectiveUntil: twelveHoursFromNow,
    },
  });

  console.log("✅ Done. currentPeriodEnd is now within ~12h (period-close window).");
  await prisma.$disconnect();
}

main().catch(console.error);
