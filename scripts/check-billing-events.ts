import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const TENANT_ID = "cmnv43tk300hc7ka8izds686q";

  const sub = await prisma.subscription.findFirst({
    where: { tenantId: TENANT_ID, provider: "paddle" },
    select: { id: true },
  });
  const events = await prisma.billingEvent.findMany({
    where: {
      OR: [{ tenantId: TENANT_ID }, { subscriptionId: sub?.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      type: true,
      providerEventId: true,
      createdAt: true,
      processStatus: true,
      payload: true,
    },
  });

  console.log(`Found ${events.length} billing event(s) for tenant ${TENANT_ID}\n`);

  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | null;
    const period =
      p && typeof p === "object"
        ? {
            currentPeriodStart: p.currentPeriodStart,
            currentPeriodEnd: p.currentPeriodEnd,
          }
        : null;
    console.log("---");
    console.log(`type: ${ev.type}`);
    console.log(`providerEventId: ${ev.providerEventId}`);
    console.log(`createdAt: ${ev.createdAt.toISOString()}`);
    console.log(`processStatus: ${ev.processStatus ?? "(null)"}`);
    console.log(`sanitized period fields: ${JSON.stringify(period)}`);
    console.log(`full payload: ${JSON.stringify(p, null, 2)}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
