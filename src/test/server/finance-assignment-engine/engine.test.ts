import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationOutcome } from "@prisma/client";

const {
  mockRecordFindFirst,
  mockTransaction,
  mockResolveTenantPlan,
  mockIsFeatureEnabled,
} = vi.hoisted(() => ({
  mockRecordFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockResolveTenantPlan: vi.fn(),
  mockIsFeatureEnabled: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    record: { findFirst: mockRecordFindFirst },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: mockResolveTenantPlan,
}));

vi.mock("@/server/security/feature-flags", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
  FEATURE_FLAG_CODES: { ASSIGNMENT_ENGINE_ENABLED: "FT_ASSIGNMENT_ENGINE_ENABLED" },
}));

import type { PlanFeatures } from "@/server/billing/provider-types";
import { evaluateAndAssign } from "@/server/services/finance-assignment-engine/index";

const approvalRoutingDisabled = {
  enabled: false,
  maxRules: 0,
  allowSequential: false,
  allowEscalation: false,
  allowCustomField: false,
} satisfies PlanFeatures["approvalRouting"];

describe("evaluateAndAssign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        financeAssignmentEvaluation: {
          create: vi.fn().mockResolvedValue({ id: "eval-1" }),
        },
      };
      return fn(tx);
    });
  });

  it("throws when record is missing for tenant", async () => {
    mockRecordFindFirst.mockResolvedValue(null);
    await expect(
      evaluateAndAssign({
        tenantId: "t1",
        recordId: "r1",
        triggerEvent: "TEST",
        triggeredByUserId: "u1",
      })
    ).rejects.toThrow(/Record not found/);
  });

  it("idempotent replay persists ASSIGNED before plan/flag (no resolveTenantPlan)", async () => {
    mockRecordFindFirst.mockResolvedValue({
      id: "r1",
      tenantId: "t1",
      title: "T",
      financeAssignedMembershipId: "mem-existing",
      createdByUserId: "u1",
    });
    const out = await evaluateAndAssign({
      tenantId: "t1",
      recordId: "r1",
      triggerEvent: "TEST",
      triggeredByUserId: null,
    });
    expect(out.outcome).toBe(EvaluationOutcome.ASSIGNED);
    expect(out.assignedMembershipId).toBe("mem-existing");
    expect(mockResolveTenantPlan).not.toHaveBeenCalled();
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  it("PLAN_NOT_ENTITLED when assignmentEngine feature is false", async () => {
    mockRecordFindFirst.mockResolvedValue({
      id: "r1",
      tenantId: "t1",
      title: "T",
      financeAssignedMembershipId: null,
      createdByUserId: "u1",
    });
    mockResolveTenantPlan.mockResolvedValue({
      features: {
        assignmentEngine: false,
        approvalRouting: approvalRoutingDisabled,
      } as PlanFeatures,
    });
    const out = await evaluateAndAssign({
      tenantId: "t1",
      recordId: "r1",
      triggerEvent: "TEST",
    });
    expect(out.outcome).toBe(EvaluationOutcome.PLAN_NOT_ENTITLED);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  it("ENGINE_DISABLED when feature flag off", async () => {
    mockRecordFindFirst.mockResolvedValue({
      id: "r1",
      tenantId: "t1",
      title: "T",
      financeAssignedMembershipId: null,
      createdByUserId: "u1",
    });
    mockResolveTenantPlan.mockResolvedValue({
      features: {
        assignmentEngine: true,
        approvalRouting: approvalRoutingDisabled,
      } as PlanFeatures,
    });
    mockIsFeatureEnabled.mockResolvedValue(false);
    const out = await evaluateAndAssign({
      tenantId: "t1",
      recordId: "r1",
      triggerEvent: "TEST",
    });
    expect(out.outcome).toBe(EvaluationOutcome.ENGINE_DISABLED);
  });
});
