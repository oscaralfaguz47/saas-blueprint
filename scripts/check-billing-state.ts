import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const TENANT_ID = "cmnv4ra6p00jz7ka8wy99bqkc";

  const states = await prisma.tenantBillingState.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { periodStart: "desc" },
    take: 5,
  });

  console.log("TenantBillingState rows for tenant:");
  console.log(JSON.stringify(states, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
