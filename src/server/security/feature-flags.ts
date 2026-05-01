import "server-only";

import { cache } from "react";
import { prisma } from "@/server/db";

/**
 * Read-only feature flag resolver. Returns false if:
 * - Flag code does not exist in FeatureFlag table
 * - TenantFeatureFlag row does not exist for tenant (closed by default)
 * - TenantFeatureFlag.isEnabled is false
 *
 * Caching: per-request dedup via React cache() with primitive args (see access-model.ts).
 */
const loadFeatureFlag = cache(async (code: string, tenantId: string): Promise<boolean> => {
  const flag = await prisma.featureFlag.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!flag) return false;

  const tenantFlag = await prisma.tenantFeatureFlag.findUnique({
    where: {
      tenantId_featureFlagId: { tenantId, featureFlagId: flag.id },
    },
    select: { isEnabled: true },
  });
  return tenantFlag?.isEnabled === true;
});

export async function isFeatureEnabled(code: string, tenantId: string): Promise<boolean> {
  return loadFeatureFlag(code, tenantId);
}

/** Stable feature flag codes used by the engine. */
export const FEATURE_FLAG_CODES = {
  ASSIGNMENT_ENGINE_ENABLED: "FT_ASSIGNMENT_ENGINE_ENABLED",
} as const;
