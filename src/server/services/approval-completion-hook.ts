import "server-only";

import type { PrismaClient, RecordApprovalStatus } from "@prisma/client";
import {
  evaluateAndAssign,
  TRIGGER_EVENTS,
} from "@/server/services/finance-assignment-engine";

export type ApprovalReconcileResult = {
  previousStatus: RecordApprovalStatus;
  newStatus: RecordApprovalStatus;
  changed: boolean;
  isTerminalTransition: boolean;
};

/**
 * After `recomputeApprovalStatus` runs inside a committed transaction, optionally runs
 * the finance assignment engine when approval just transitioned to FULLY_APPROVED.
 *
 * Callers must invoke this only after their outer `prisma.$transaction` commits.
 * Engine failures are logged and swallowed — they never throw to the caller.
 */
export async function maybeAssignFinanceAfterApprovalReconcile(
  prisma: PrismaClient,
  reconcileResult: ApprovalReconcileResult,
  ctx: {
    tenantId: string;
    recordId: string;
    actorUserId?: string | null;
  }
): Promise<{
  engineTriggered: boolean;
  engineEvaluationId: string | null;
  engineOutcome: string | null;
}> {
  const shouldRun =
    reconcileResult.changed === true &&
    reconcileResult.newStatus === "FULLY_APPROVED" &&
    reconcileResult.previousStatus !== "FULLY_APPROVED";

  if (!shouldRun) {
    return {
      engineTriggered: false,
      engineEvaluationId: null,
      engineOutcome: null,
    };
  }

  void prisma;

  try {
    const out = await evaluateAndAssign({
      tenantId: ctx.tenantId,
      recordId: ctx.recordId,
      triggerEvent: TRIGGER_EVENTS.APPROVAL_FULLY_COMPLETED,
      triggeredByUserId: ctx.actorUserId ?? null,
    });
    return {
      engineTriggered: true,
      engineEvaluationId: out.evaluationId,
      engineOutcome: out.outcome,
    };
  } catch (engineErr) {
    console.error("[approval-completion-hook] evaluateAndAssign failed", {
      recordId: ctx.recordId,
      tenantId: ctx.tenantId,
      phase: "engine_error",
      error: engineErr instanceof Error ? engineErr.message : String(engineErr),
    });
    return {
      engineTriggered: false,
      engineEvaluationId: null,
      engineOutcome: null,
    };
  }
}
