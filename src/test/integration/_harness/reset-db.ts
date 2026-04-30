import type { PrismaClient } from "@prisma/client";

/**
 * Truncate all application tables in `public` while preserving migration history.
 * Uses catalog metadata so new models do not require updating a hand-maintained list.
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;

  const list = rows
    .map((r) => `"${r.tablename.replace(/"/g, '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`
  );
}
