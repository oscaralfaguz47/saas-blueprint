import "server-only";

import { PrismaClient } from "@prisma/client";

// Don't validate env during build - only at runtime
// Vercel sets env vars at runtime, not during build
const isBuildPhase = 
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "true" ||
  !process.env.DATABASE_URL; // If DATABASE_URL is missing, we're likely in build phase

if (!isBuildPhase) {
  // Only validate at runtime, not during build
  const { validateEnv } = require("@/lib/env");
  try {
    validateEnv();
  } catch (error) {
    // Log but don't fail during module load
    // Will fail at runtime when Prisma tries to connect
    console.warn("Environment validation warning:", error);
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
