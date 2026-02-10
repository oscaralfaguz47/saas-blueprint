/**
 * One-off script: sync role-permission links for all existing tenants per A2.
 * Run after updating role permissions in tenant-role-permissions.ts.
 * Uses Prisma + shared lib only (no server-only imports).
 *
 * Usage: pnpm run sync:role-permissions
 *
 * Production / multiple environments:
 * - Option A: Add a SQL migration (see prisma/migrations/*_a2_sync_*) that inserts
 *   the new role-permission rows. Then "prisma migrate deploy" updates every env.
 * - Option B: Run this script in your deploy pipeline after "prisma migrate deploy"
 *   (idempotent, so safe to run every deploy).
 */
import { PrismaClient } from "@prisma/client";
import { ensureTenantRolesAndPermissionsWithPrisma } from "../src/lib/tenant-role-permissions";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true },
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
  });
  for (const t of tenants) {
    await ensureTenantRolesAndPermissionsWithPrisma(prisma, { tenantId: t.id });
  }
  console.log("Synced role permissions for", tenants.length, "tenant(s).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
