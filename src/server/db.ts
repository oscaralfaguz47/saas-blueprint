import "server-only";

import { PrismaClient } from "@prisma/client";
import { validateEnv } from "@/lib/env";

// Validate environment variables on module load
validateEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
