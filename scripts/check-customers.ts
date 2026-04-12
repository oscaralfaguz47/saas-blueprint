import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
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
    take: 10,
  });

  console.log("All subscriptions:");
  console.table(
    subs.map((s) => ({
      tenantId: s.tenantId.slice(-8),
      customerId: s.providerCustomerId,
      subId: s.providerSubscriptionId,
      plan: s.plan?.code,
      interval: s.billingInterval,
      status: s.status,
    })),
  );

  // Check for shared customer IDs across tenants
  const byCustomer = new Map<string, string[]>();
  for (const sub of subs) {
    if (!sub.providerCustomerId) continue;
    const tenants = byCustomer.get(sub.providerCustomerId) ?? [];
    if (!tenants.includes(sub.tenantId)) tenants.push(sub.tenantId);
    byCustomer.set(sub.providerCustomerId, tenants);
  }

  console.log("\nCustomer IDs shared across multiple tenants:");
  let found = false;
  for (const [customerId, tenants] of byCustomer) {
    if (tenants.length > 1) {
      console.log(`  Customer ${customerId} → tenants: ${tenants.join(", ")}`);
      found = true;
    }
  }
  if (!found) console.log("  None found.");

  await prisma.$disconnect();
}
main().catch(console.error);
