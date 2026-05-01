import "server-only";

import type { PrismaClient, RecordApprovalStatus } from "@prisma/client";
import { NotificationType } from "@prisma/client";
import type { ApprovalRecomputeTrigger } from "@/server/services/record-approval-status";
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";
import { unblockNextStepIfReady } from "@/server/services/approval-routing-engine/unblock-next-step";
import { createNotification } from "@/server/services/notifications/notification-service";

export type ApprovalUnblockHookCtx = {
  tenantId: string;
  recordId: string;
  actorUserId?: string | null;
  triggeredByParticipantId?: string;
  triggeredByAction?: ApprovalRecomputeTrigger;
};

function isApproveOnlyTrigger(action: ApprovalRecomputeTrigger | undefined): boolean {
  return action === "INTERNAL_APPROVED" || action === "EXTERNAL_APPROVED";
}

function isTerminalApprovalStatus(status: RecordApprovalStatus): boolean {
  return (
    status === "FULLY_APPROVED" ||
    status === "APPROVAL_REJECTED" ||
    status === "APPROVAL_EXPIRED"
  );
}

/**
 * After A4 reconciler runs (post-commit), optionally unblocks the next sequential routing step.
 * Approve-only whitelist; never throws to API callers.
 */
export async function maybeUnblockNextApprovalStep(
  db: PrismaClient,
  reconcileResult: {
    changed: boolean;
    newStatus: RecordApprovalStatus;
  },
  ctx: ApprovalUnblockHookCtx
): Promise<{ unblockedCount: number }> {
  if (isTerminalApprovalStatus(reconcileResult.newStatus)) {
    return { unblockedCount: 0 };
  }
  if (!isApproveOnlyTrigger(ctx.triggeredByAction)) {
    return { unblockedCount: 0 };
  }
  // Note: do not require reconcileResult.changed — sequential unblock often keeps
  // Record.approvalStatus at WAITING_FOR_APPROVAL (PENDING → more PENDING_BLOCKED).

  const actorUserId = ctx.actorUserId ?? null;
  if (!actorUserId) {
    console.error("[approval-unblock-hook] missing actorUserId; skip unblock", {
      recordId: ctx.recordId,
      tenantId: ctx.tenantId,
    });
    return { unblockedCount: 0 };
  }

  try {
    const unblockOutcome = await db.$transaction(async (tx) => {
      const result = await unblockNextStepIfReady(tx, {
        tenantId: ctx.tenantId,
        recordId: ctx.recordId,
        actorUserId,
      });
      if (result.unblockedCount > 0) {
        await recomputeApprovalStatus(tx, {
          tenantId: ctx.tenantId,
          recordId: ctx.recordId,
          triggeredByParticipantId: ctx.triggeredByParticipantId,
          triggeredByAction: "SEQUENTIAL_STEP_UNBLOCKED",
          actorUserId,
        });
      }
      return result;
    });

    if (unblockOutcome.unblockedCount === 0) {
      return { unblockedCount: 0 };
    }

    const record = await db.record.findFirst({
      where: { id: ctx.recordId, tenantId: ctx.tenantId },
      select: { title: true },
    });
    const title = record?.title ?? "Request";

    for (const row of unblockOutcome.unblockedRows) {
      if (!row.userId) continue;
      try {
        await createNotification({
          userId: row.userId,
          type: NotificationType.RECORD_APPROVAL_REQUESTED,
          title: `Approval requested: ${title}`,
          entityType: "Record",
          entityId: ctx.recordId,
          actionUrl: `/app/queue/${ctx.recordId}`,
        });
      } catch (notifyErr) {
        console.error("[approval-unblock-hook] createNotification failed", {
          recordId: ctx.recordId,
          tenantId: ctx.tenantId,
          userId: row.userId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }

    return { unblockedCount: unblockOutcome.unblockedCount };
  } catch (err) {
    console.error("[approval-unblock-hook] unblock failed", {
      recordId: ctx.recordId,
      tenantId: ctx.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { unblockedCount: 0 };
  }
}
