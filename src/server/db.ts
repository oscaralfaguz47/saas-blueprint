import "server-only";

import { PrismaClient } from "@prisma/client";

// Environment validation happens automatically when env.ts is imported.
// Import env to trigger validation at DB module load time.
import "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let testOverride: PrismaClient | null = null;

/**
 * Replace the process-wide Prisma client (integration tests only).
 * @throws if NODE_ENV is production
 */
export function setPrismaClient(client: PrismaClient): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setPrismaClient is not allowed in production");
  }
  testOverride = client;
}

/** Clear integration override; subsequent calls use the default singleton. */
export function clearPrismaClientOverride(): void {
  testOverride = null;
}

const defaultClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = defaultClient;
}

/**
 * Proxy preserves PrismaClient typing while allowing `setPrismaClient` in tests.
 * Function properties are bound so `$transaction` and delegates keep correct `this`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = testOverride ?? defaultClient;
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

// Also export as `db` for consistency with newer code patterns
export const db = prisma;
