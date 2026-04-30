import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export function createTestPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: connectionString } },
    log: [],
  });
}

/** Invoke local Prisma CLI via Node (avoids Windows `npx.cmd` + execFile EINVAL issues). */
function execPrisma(args: string[], env: NodeJS.ProcessEnv): void {
  const prismaCli = path.join(
    process.cwd(),
    "node_modules",
    "prisma",
    "build",
    "index.js"
  );
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
  });
}

/**
 * Apply all migrations, then system seed (permissions catalog, vendor roles, plans).
 * Seed is required: migrations do not insert Permission rows; RBAC helpers expect them.
 */
export function applyMigrations(connectionString: string): void {
  const schema = path.join("prisma", "schema.prisma");
  const env = {
    ...process.env,
    DATABASE_URL: connectionString,
    DATABASE_DIRECT_URL: connectionString,
  };

  execPrisma(["migrate", "deploy", "--schema", schema], env);
  execPrisma(["db", "seed"], env);
}

export async function disconnectTestPrismaClient(
  client: PrismaClient
): Promise<void> {
  await client.$disconnect();
}
