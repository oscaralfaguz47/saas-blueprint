/**
 * One-off: list Plan rows (code, prices, active). Run after seed.
 * Usage: npx tsx scripts/verify-plans.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.plan.findMany({
    select: { code: true, name: true, priceMonthly: true, priceYearly: true, isActive: true },
    orderBy: { code: "asc" },
  });
  console.table(plans);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
