import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const subs = await prisma.subscription.findMany({
    select: {
      id: true,
      tenantId: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      billingInterval: true,
      billingPlanCode: true,
      status: true,
      plan: { select: { code: true } },
    },
    orderBy: { id: "desc" },
  });

  const base =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const key = process.env.PADDLE_API_KEY!;

  console.log("=== DB SUBSCRIPTIONS ===");
  console.table(
    subs.map((s) => ({
      tenantId: s.tenantId.slice(-8),
      customerId: s.providerCustomerId,
      subId: s.providerSubscriptionId?.slice(-12),
      plan: s.plan?.code,
      interval: s.billingInterval,
      status: s.status,
    })),
  );

  console.log("\n=== PADDLE SUBSCRIPTIONS (live) ===");
  for (const sub of subs) {
    if (!sub.providerSubscriptionId) continue;
    const res = await fetch(`${base}/subscriptions/${sub.providerSubscriptionId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = (await res.json()) as any;
    const data = json?.data;
    if (!data) {
      console.log(`Sub ${sub.providerSubscriptionId}: NOT FOUND`);
      continue;
    }
    console.log(`\nTenant ...${sub.tenantId.slice(-8)} | Sub ${data.id}`);
    console.log(`  customer_id: ${data.customer_id}`);
    console.log(`  status: ${data.status}`);
    console.log(`  billing_cycle: ${JSON.stringify(data.billing_cycle)}`);
    console.log(`  next_billed_at: ${data.next_billed_at}`);
    console.log(`  scheduled_change: ${JSON.stringify(data.scheduled_change)}`);
    console.log(`  items[0].price.id: ${data.items?.[0]?.price?.id}`);
    console.log(`  items[0].price.unit_price: ${JSON.stringify(data.items?.[0]?.price?.unit_price)}`);
    console.log(`  items[0].next_billed_at: ${data.items?.[0]?.next_billed_at}`);

    const nextRes = await fetch(`${base}/subscriptions/${data.id}/next-transaction`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (nextRes.ok) {
      const nextJson = (await nextRes.json()) as any;
      const nextData = nextJson?.data;
      console.log(`  next_transaction.totals: ${JSON.stringify(nextData?.totals)}`);
      console.log(
        `  next_transaction.details.line_items: ${JSON.stringify(
          nextData?.details?.line_items?.map((l: any) => ({
            total: l.totals?.total,
            proration: l.proration,
          })),
        )}`,
      );
    }
  }

  const uniqueCustomers = [...new Set(subs.map((s) => s.providerCustomerId).filter(Boolean))];
  console.log("\n=== PADDLE CUSTOMER SUBSCRIPTIONS ===");
  for (const customerId of uniqueCustomers) {
    const res = await fetch(
      `${base}/subscriptions?customer_id=${customerId}&per_page=20`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const json = (await res.json()) as any;
    const paddleSubs = json?.data ?? [];
    console.log(`\nCustomer ${customerId} has ${paddleSubs.length} subscription(s) in Paddle:`);
    for (const ps of paddleSubs) {
      console.log(
        `  - ${ps.id} | status: ${ps.status} | plan: ${ps.custom_data?.planCode} | interval: ${ps.billing_cycle?.interval} | next: ${ps.next_billed_at}`,
      );
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
