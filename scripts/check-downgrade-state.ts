async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const base =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const key = process.env.PADDLE_API_KEY!;

  const sub = await prisma.subscription.findFirst({
    orderBy: { id: "desc" },
    select: {
      id: true,
      tenantId: true,
      providerSubscriptionId: true,
      billingInterval: true,
      billingPlanCode: true,
      currentEntitlementPlanCode: true,
      pendingPlanCode: true,
      pendingChangeType: true,
      pendingEffectiveAt: true,
      entitlementEffectiveUntil: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      plan: { select: { code: true } },
    },
  });

  console.log("=== DB STATE ===");
  console.log(JSON.stringify(sub, null, 2));

  if (!sub?.providerSubscriptionId) {
    console.log("No providerSubscriptionId");
    await prisma.$disconnect();
    return;
  }

  const res = await fetch(`${base}/subscriptions/${sub.providerSubscriptionId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json()) as any;
  const data = json?.data;

  console.log("\n=== PADDLE STATE ===");
  console.log(`status: ${data?.status}`);
  console.log(`billing_cycle: ${JSON.stringify(data?.billing_cycle)}`);
  console.log(`current_billing_period: ${JSON.stringify(data?.current_billing_period)}`);
  console.log(`next_billed_at: ${data?.next_billed_at}`);
  console.log(`scheduled_change: ${JSON.stringify(data?.scheduled_change, null, 2)}`);
  console.log(`items[0].price.id: ${data?.items?.[0]?.price?.id}`);
  console.log(`items[0].price.description: ${data?.items?.[0]?.price?.description}`);
  console.log(`items[0].price.billing_cycle: ${JSON.stringify(data?.items?.[0]?.price?.billing_cycle)}`);
  console.log(`items[0].price.unit_price: ${JSON.stringify(data?.items?.[0]?.price?.unit_price)}`);
  console.log(`items[0].next_billed_at: ${data?.items?.[0]?.next_billed_at}`);

  const nextRes = await fetch(
    `${base}/subscriptions/${sub.providerSubscriptionId}/next-transaction`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (nextRes.ok) {
    const nextJson = (await nextRes.json()) as any;
    console.log("\n=== NEXT TRANSACTION ===");
    console.log(`totals: ${JSON.stringify(nextJson?.data?.totals, null, 2)}`);
    console.log(`billing_period: ${JSON.stringify(nextJson?.data?.billing_period)}`);
    console.log(
      `line_items: ${JSON.stringify(
        nextJson?.data?.details?.line_items?.map((l: any) => ({
          price_id: l.price?.id,
          description: l.price?.description,
          billing_cycle: l.price?.billing_cycle,
          total: l.totals?.total,
          proration: l.proration,
        })),
        null,
        2,
      )}`,
    );
  } else {
    console.log(`\nnext-transaction: ${nextRes.status} ${await nextRes.text()}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
