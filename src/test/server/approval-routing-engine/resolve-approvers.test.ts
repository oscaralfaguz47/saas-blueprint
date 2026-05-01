import { describe, expect, it, vi } from "vitest";
import type { ApprovalRoutingRuleApprover } from "@prisma/client";
import { ApproverTargetType } from "@prisma/client";
import { resolveApproversForRule } from "@/server/services/approval-routing-engine/resolve-approvers";
import type { DbTx } from "@/server/services/record-approval-status";

function approver(
  partial: Pick<ApprovalRoutingRuleApprover, "id" | "sequenceOrder" | "targetType"> &
    Partial<ApprovalRoutingRuleApprover>
): ApprovalRoutingRuleApprover {
  return {
    tenantId: "t1",
    ruleId: "r1",
    targetMembershipId: null,
    targetWorkspaceRole: null,
    targetFinanceResponsibility: null,
    targetTeamId: null,
    requireAll: false,
    createdAt: new Date(),
    deletedAt: null,
    ...partial,
  } as ApprovalRoutingRuleApprover;
}

describe("resolveApproversForRule", () => {
  it("sorts by sequenceOrder and dedupes duplicate userId keeping lowest step", async () => {
    const db = {
      tenantMembership: {
        findFirst: vi.fn().mockImplementation(({ where: w }: { where: { id: string } }) => {
          if (w.id === "m1") return Promise.resolve({ userId: "u1" });
          if (w.id === "m2") return Promise.resolve({ userId: "u1" });
          return Promise.resolve(null);
        }),
      },
      financeTeamMember: { findMany: vi.fn() },
    };

    const approvers = [
      approver({
        id: "step2",
        sequenceOrder: 2,
        targetType: ApproverTargetType.SPECIFIC_USER,
        targetMembershipId: "m2",
      }),
      approver({
        id: "step1",
        sequenceOrder: 1,
        targetType: ApproverTargetType.SPECIFIC_USER,
        targetMembershipId: "m1",
      }),
    ];

    const out = await resolveApproversForRule(db as unknown as DbTx, "t1", approvers, {
      parallelRule: false,
    });

    expect(out.kept).toEqual([
      {
        userId: "u1",
        sequenceOrder: 1,
        routingApproverId: "step1",
      },
    ]);
    expect(out.discarded).toEqual([
      {
        userId: "u1",
        sequenceOrder: 2,
        routingApproverId: "step2",
        reason: "DUPLICATE_USER_LOWER_STEP_KEPT",
      },
    ]);
  });

  it("forces sequenceOrder 1 for all rows when parallelRule is true", async () => {
    const db = {
      tenantMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ userId: "u1" })
          .mockResolvedValueOnce({ userId: "u2" }),
      },
      financeTeamMember: { findMany: vi.fn() },
    };

    const approvers = [
      approver({
        id: "a1",
        sequenceOrder: 2,
        targetType: ApproverTargetType.SPECIFIC_USER,
        targetMembershipId: "m1",
      }),
      approver({
        id: "a2",
        sequenceOrder: 3,
        targetType: ApproverTargetType.SPECIFIC_USER,
        targetMembershipId: "m2",
      }),
    ];

    const out = await resolveApproversForRule(db as unknown as DbTx, "t1", approvers, {
      parallelRule: true,
    });

    expect(out.kept.map((k) => k.sequenceOrder)).toEqual([1, 1]);
  });
});
