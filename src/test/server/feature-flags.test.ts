import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureFlagFindUnique: vi.fn(),
  tenantFeatureFlagFindUnique: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    featureFlag: { findUnique: mocks.featureFlagFindUnique },
    tenantFeatureFlag: { findUnique: mocks.tenantFeatureFlagFindUnique },
  },
}));

import { FEATURE_FLAG_CODES, isFeatureEnabled } from "@/server/security/feature-flags";

const FLAG_ID = "cffeatureflag0000c7a000001";

/** Distinct tenantId per test so React cache() does not cross-pollute cases. */
const T = {
  missingFlag: "clffc7a01000000000001",
  noTenantRow: "clffc7a02000000000001",
  disabled: "clffc7a03000000000001",
  enabled: "clffc7a04000000000001",
  multiA: "clffc7a05000000000001",
  multiB: "clffc7a06000000000001",
  dedup: "clffc7a07000000000001",
} as const;

describe("isFeatureEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when FeatureFlag row is missing", async () => {
    mocks.featureFlagFindUnique.mockResolvedValue(null);
    await expect(
      isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.missingFlag)
    ).resolves.toBe(false);
    expect(mocks.featureFlagFindUnique).toHaveBeenCalledWith({
      where: { code: FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED },
      select: { id: true },
    });
    expect(mocks.tenantFeatureFlagFindUnique).not.toHaveBeenCalled();
  });

  it("returns false when FeatureFlag exists but TenantFeatureFlag row is missing", async () => {
    mocks.featureFlagFindUnique.mockResolvedValue({ id: FLAG_ID });
    mocks.tenantFeatureFlagFindUnique.mockResolvedValue(null);
    await expect(
      isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.noTenantRow)
    ).resolves.toBe(false);
    expect(mocks.tenantFeatureFlagFindUnique).toHaveBeenCalledWith({
      where: { tenantId_featureFlagId: { tenantId: T.noTenantRow, featureFlagId: FLAG_ID } },
      select: { isEnabled: true },
    });
  });

  it("returns false when TenantFeatureFlag.isEnabled is false", async () => {
    mocks.featureFlagFindUnique.mockResolvedValue({ id: FLAG_ID });
    mocks.tenantFeatureFlagFindUnique.mockResolvedValue({ isEnabled: false });
    await expect(
      isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.disabled)
    ).resolves.toBe(false);
  });

  it("returns true when TenantFeatureFlag.isEnabled is true", async () => {
    mocks.featureFlagFindUnique.mockResolvedValue({ id: FLAG_ID });
    mocks.tenantFeatureFlagFindUnique.mockResolvedValue({ isEnabled: true });
    await expect(
      isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.enabled)
    ).resolves.toBe(true);
  });

  it("resolves per tenant independently", async () => {
    mocks.featureFlagFindUnique.mockResolvedValue({ id: FLAG_ID });
    mocks.tenantFeatureFlagFindUnique.mockImplementation(async ({ where }) => {
      const tid = where.tenantId_featureFlagId.tenantId as string;
      if (tid === T.multiA) return { isEnabled: true };
      return { isEnabled: false };
    });
    await expect(
      isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.multiA)
    ).resolves.toBe(true);
    await expect(
      isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.multiB)
    ).resolves.toBe(false);
    expect(mocks.tenantFeatureFlagFindUnique).toHaveBeenCalledTimes(2);
  });

  /**
   * React cache() is intended to dedupe per-request in RSC/Next.js. Vitest runs outside that
   * scheduler, so Prisma spy call counts are not asserted here — only stable outcomes.
   */
  it("repeated calls with same args return the same resolved value", async () => {
    mocks.featureFlagFindUnique.mockResolvedValue({ id: FLAG_ID });
    mocks.tenantFeatureFlagFindUnique.mockResolvedValue({ isEnabled: true });
    const a = await isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.dedup);
    const b = await isFeatureEnabled(FEATURE_FLAG_CODES.ASSIGNMENT_ENGINE_ENABLED, T.dedup);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(mocks.featureFlagFindUnique).toHaveBeenCalled();
  });
});
