import "server-only";

import { PrismaClient } from "@prisma/client";

// Don't validate env during build - only at runtime
// Vercel sets env vars at runtime, not during build
// During build, Next.js may try to analyze server components, so we skip validation
const isBuildPhase = 
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-development-build" ||
  process.env.SKIP_ENV_VALIDATION === "true" ||
  typeof window !== "undefined" || // Client-side check
  !process.env.DATABASE_URL; // If DATABASE_URL is missing, we're likely in build phase

if (!isBuildPhase && typeof process !== "undefined") {
  // Only validate at runtime, not during build
  try {
    // Use dynamic import to avoid issues during build
    const { validateEnv } = require("@/lib/env");
    validateEnv();
  } catch (error) {
    // Log but don't fail during module load
    // Will fail at runtime when Prisma tries to connect
    if (process.env.NODE_ENV !== "production") {
      console.warn("Environment validation warning:", error);
    }
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
