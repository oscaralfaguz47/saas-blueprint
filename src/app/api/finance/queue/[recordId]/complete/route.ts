import "server-only";

import { getServerSession } from "next-auth";
import { FinanceStatus, RecordEventType } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { requireFinanceQueueAssignee } from "@/server/security/finance-queue-authorization";
import {
  FinanceStatusTransitionError,
  recomputeFinanceStatus,
} from "@/server/services/record-finance-status";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { financeQueueRecordIdParamSchema } from "@/lib/validations/finance-queue";

const INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION";

/**
 * POST /api/finance/queue/[recordId]/complete
 * C9 — ASSIGNED | IN_PROGRESS → COMPLETED. Decrements financeOpenAssignmentsCount.
 */
export const POST = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ recordId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const { recordId } = financeQueueRecordIdParamSchema.parse(await context.params);

  const gate = await requireFinanceQueueAssignee({
    tenantId,
    userId: session.user.id,
    recordId,
  });
  if (!gate.ok) return gate.response;

  const preRead = await prisma.record.findFirst({
    where: {
      id: recordId,
      tenantId,
      financeAssignedMembershipId: gate.membershipId,
    },
    select: { financeStatus: true },
  });
  if (!preRead) {
    return ApiErrors.NOT_FOUND("Record");
  }
  if (
    preRead.financeStatus !== FinanceStatus.ASSIGNED &&
    preRead.financeStatus !== FinanceStatus.IN_PROGRESS
  ) {
    return apiError("INVALID_STATE_TRANSITION", 409, "Invalid state transition for this record");
  }

  /** Best-effort for audit metadata; rare races may skew vs final row. Truth: recordEvent chain. */
  const fromStatus = preRead.financeStatus;
  const skippedStart = fromStatus === FinanceStatus.ASSIGNED;

  try {
    await prisma.$transaction(async (tx) => {
      await recomputeFinanceStatus(tx, {
        tenantId,
        recordId,
        newStatus: FinanceStatus.COMPLETED,
        expectFromStatus: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS],
        expectFromAssignee: gate.membershipId,
        decrementMembershipId: gate.membershipId,
      });

      await tx.recordEvent.create({
        data: {
          tenantId,
          recordId,
          eventType: RecordEventType.FINANCE_WORK_COMPLETED,
          actorUserId: session.user.id,
          metadata: { fromStatus, skippedStart },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId,
          action: "record.finance.work_completed",
          targetType: "Record",
          targetId: recordId,
          metadata: { fromStatus, skippedStart },
        },
      });
    });
  } catch (err: unknown) {
    if (
      err instanceof FinanceStatusTransitionError &&
      err.reason === "INVALID_STATE_TRANSITION"
    ) {
      return apiError("INVALID_STATE_TRANSITION", 409, "Invalid state transition for this record");
    }
    throw err;
  }

  return apiSuccess({ ok: true, financeStatus: "COMPLETED" as const });
});
