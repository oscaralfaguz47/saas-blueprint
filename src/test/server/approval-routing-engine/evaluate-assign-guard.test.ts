import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  recordFindFirst: vi.fn(),
  recordParticipantCount: vi.fn(),
  resolveTenantPlan: vi.fn(),
  approvalRoutingRuleFindMany: vi.fn(),
  evalCreate: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    record: { findFirst: hoisted.recordFindFirst },
    recordParticipant: { count: hoisted.recordParticipantCount },
    approvalRoutingRule: { findMany: hoisted.approvalRoutingRuleFindMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        approvalRoutingEvaluation: { create: hoisted.evalCreate },
      })
    ),
  },
}));

vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: hoisted.resolveTenantPlan,
}));

vi.mock("@/server/services/approval-routing-engine/resolve-approvers", () => ({
  resolveApproversForRule: vi.fn(),
}));

vi.mock("@/server/services/record-approval-status", () => ({
  recomputeApprovalStatus: vi.fn(),
}));

vi.mock("@/server/services/notifications", () => ({
  createNotification: vi.fn(),
}));

import {
  APPROVAL_ROUTING_TRIGGER_EVENTS,
  evaluateAndAssign,
} from "@/server/services/approval-routing-engine";

describe("evaluateAndAssign EXISTING_APPROVERS guard (C14)", () => {
  const openRecord = {
    id: "rec1",
    tenantId: "t1",
    status: "OPEN" as const,
    title: "R",
    createdByUserId: "u0",
    type: "BUDGET",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.recordFindFirst.mockResolvedValue(openRecord);
    hoisted.resolveTenantPlan.mockResolvedValue({
      features: { approvalRouting: { enabled: false } },
    });
    hoisted.approvalRoutingRuleFindMany.mockResolvedValue([]);
    hoisted.evalCreate.mockResolvedValue({ id: "eval-plan-off" });
  });

  it("RECORD_CREATED: skips when any active approver exists (unchanged)", async () => {
    hoisted.recordParticipantCount.mockResolvedValue(1);
    const out = await evaluateAndAssign({
      tenantId: "t1",
      recordId: "rec1",
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: "u1",
    });
    expect(out).toEqual({ skipped: true, reason: "EXISTING_APPROVERS" });
    expect(hoisted.recordParticipantCount).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        recordId: "rec1",
        participantRole: "APPROVER",
        revokedAt: null,
      },
    });
  });

  it("ADMIN_MANUAL_REEVALUATION: does not apply EXISTING_APPROVERS count (bypass)", async () => {
    hoisted.recordParticipantCount.mockResolvedValue(99);
    const out = await evaluateAndAssign({
      tenantId: "t1",
      recordId: "rec1",
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION,
      triggeredByUserId: "u1",
    });
    expect(hoisted.recordParticipantCount).not.toHaveBeenCalled();
    expect(out.skipped).toBe(false);
  });
});
