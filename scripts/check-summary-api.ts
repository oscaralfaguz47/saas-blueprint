import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const TENANT_ID = "cmnv2nkf000927ka85a6o41pr";

  const sub = await prisma.subscription.findFirst({
    where: { tenantId: TENANT_ID, provider: "paddle" },
    select: {
      billingInterval: true,
      pendingBillingInterval: true,
      pendingPlanCode: true,
      pendingChangeType: true,
      currentEntitlementPlanCode: true,
      plan: { select: { code: true } },
    },
  });

  console.log("DB state:");
  console.log(JSON.stringify(sub, null, 2));

  await prisma.$disconnect();
}
main().catch(console.error);
