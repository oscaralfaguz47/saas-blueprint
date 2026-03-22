import "server-only";

import { PrismaClient } from "@prisma/client";

// Environment validation happens automatically when env.ts is imported.
// Import env to trigger validation at DB module load time.
import "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Also export as `db` for consistency with newer code patterns
export const db = prisma;
