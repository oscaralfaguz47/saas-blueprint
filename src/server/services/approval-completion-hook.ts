import "server-only";

import type { PrismaClient, RecordApprovalStatus } from "@prisma/client";
import { RecordParticipantRole } from "@prisma/client";
import {
  evaluateAndAssign,
  TRIGGER_EVENTS,
} from "@/server/services/finance-assignment-engine";
import { buildRecordApprovalCompletedData } from "@/server/webhooks/event-builders";
import { enqueueWebhookEvent } from "@/server/webhooks/enqueue";

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
  const fullyApprovedTransition =
    reconcileResult.changed === true &&
    reconcileResult.newStatus === "FULLY_APPROVED" &&
    reconcileResult.previousStatus !== "FULLY_APPROVED";

  if (fullyApprovedTransition) {
    try {
      const completedAt = new Date();
      const approverRows = await prisma.recordParticipant.findMany({
        where: {
          tenantId: ctx.tenantId,
          recordId: ctx.recordId,
          participantRole: RecordParticipantRole.APPROVER,
          revokedAt: null,
        },
        select: { id: true, userId: true, status: true },
      });
      await enqueueWebhookEvent({
        tenantId: ctx.tenantId,
        eventName: "record.approval.completed",
        recordId: ctx.recordId,
        occurredAt: completedAt,
        data: buildRecordApprovalCompletedData({
          recordId: ctx.recordId,
          completedAt,
          approvers: approverRows
            .filter((r): r is typeof r & { userId: string } => r.userId != null)
            .map((r) => ({
              participantId: r.id,
              userId: r.userId,
              status: String(r.status),
            })),
        }),
      });
    } catch (webhookErr) {
      console.error("[approval-completion-hook] webhook enqueue defensive catch", {
        recordId: ctx.recordId,
        tenantId: ctx.tenantId,
        error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
      });
    }
  }

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
