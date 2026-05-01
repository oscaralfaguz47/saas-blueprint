import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationOutcome } from "@prisma/client";

const hoistedMocks = vi.hoisted(() => ({
  evaluateAndAssign: vi.fn(),
}));

vi.mock("@/server/services/finance-assignment-engine", () => ({
  evaluateAndAssign: hoistedMocks.evaluateAndAssign,
  TRIGGER_EVENTS: { APPROVAL_FULLY_COMPLETED: "APPROVAL_FULLY_COMPLETED" },
}));

import { maybeAssignFinanceAfterApprovalReconcile } from "@/server/services/approval-completion-hook";
import { prisma } from "@/server/db";

describe("maybeAssignFinanceAfterApprovalReconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls engine on transition to FULLY_APPROVED", async () => {
    hoistedMocks.evaluateAndAssign.mockResolvedValue({
      outcome: EvaluationOutcome.ASSIGNED,
      evaluationId: "eval-1",
    });

    const out = await maybeAssignFinanceAfterApprovalReconcile(
      prisma,
      {
        previousStatus: "WAITING_FOR_APPROVAL",
        newStatus: "FULLY_APPROVED",
        changed: true,
        isTerminalTransition: true,
      },
      { tenantId: "t1", recordId: "r1", actorUserId: "u1" }
    );

    expect(hoistedMocks.evaluateAndAssign).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.evaluateAndAssign).toHaveBeenCalledWith({
      tenantId: "t1",
      recordId: "r1",
      triggerEvent: "APPROVAL_FULLY_COMPLETED",
      triggeredByUserId: "u1",
    });
    expect(out.engineTriggered).toBe(true);
    expect(out.engineEvaluationId).toBe("eval-1");
    expect(out.engineOutcome).toBe(EvaluationOutcome.ASSIGNED);
  });

  it("does not call engine when changed is false", async () => {
    const out = await maybeAssignFinanceAfterApprovalReconcile(
      prisma,
      {
        previousStatus: "FULLY_APPROVED",
        newStatus: "FULLY_APPROVED",
        changed: false,
        isTerminalTransition: true,
      },
      { tenantId: "t1", recordId: "r1" }
    );

    expect(hoistedMocks.evaluateAndAssign).not.toHaveBeenCalled();
    expect(out.engineTriggered).toBe(false);
  });

  it("does not call engine when newStatus is not FULLY_APPROVED", async () => {
    const out = await maybeAssignFinanceAfterApprovalReconcile(
      prisma,
      {
        previousStatus: "WAITING_FOR_APPROVAL",
        newStatus: "APPROVAL_REJECTED",
        changed: true,
        isTerminalTransition: true,
      },
      { tenantId: "t1", recordId: "r1" }
    );

    expect(hoistedMocks.evaluateAndAssign).not.toHaveBeenCalled();
    expect(out.engineTriggered).toBe(false);
  });

  it("does not call engine on inconsistent changed=true with same status (defensive)", async () => {
    const out = await maybeAssignFinanceAfterApprovalReconcile(
      prisma,
      {
        previousStatus: "FULLY_APPROVED",
        newStatus: "FULLY_APPROVED",
        changed: true,
        isTerminalTransition: true,
      },
      { tenantId: "t1", recordId: "r1" }
    );

    expect(hoistedMocks.evaluateAndAssign).not.toHaveBeenCalled();
    expect(out.engineTriggered).toBe(false);
  });

  it("does not throw when engine throws; engineTriggered false", async () => {
    hoistedMocks.evaluateAndAssign.mockRejectedValue(new Error("engine boom"));

    const out = await maybeAssignFinanceAfterApprovalReconcile(
      prisma,
      {
        previousStatus: "WAITING_FOR_APPROVAL",
        newStatus: "FULLY_APPROVED",
        changed: true,
        isTerminalTransition: true,
      },
      { tenantId: "t1", recordId: "r1", actorUserId: "u1" }
    );

    expect(out.engineTriggered).toBe(false);
    expect(out.engineEvaluationId).toBeNull();
    expect(out.engineOutcome).toBeNull();
  });

  it("populates engine fields on success", async () => {
    hoistedMocks.evaluateAndAssign.mockResolvedValue({
      outcome: EvaluationOutcome.NO_RULE_MATCHED,
      evaluationId: "eval-nr",
    });

    const out = await maybeAssignFinanceAfterApprovalReconcile(
      prisma,
      {
        previousStatus: "WAITING_FOR_APPROVAL",
        newStatus: "FULLY_APPROVED",
        changed: true,
        isTerminalTransition: true,
      },
      { tenantId: "t1", recordId: "r1", actorUserId: null }
    );

    expect(out.engineTriggered).toBe(true);
    expect(out.engineEvaluationId).toBe("eval-nr");
    expect(out.engineOutcome).toBe(EvaluationOutcome.NO_RULE_MATCHED);
  });
});
