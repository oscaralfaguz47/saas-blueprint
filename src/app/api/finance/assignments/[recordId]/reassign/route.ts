import "server-only";

import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import {
  EvaluationOutcome,
  FinanceResponsibility,
  FinanceStatus,
  NotificationType,
  RecordEventType,
} from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import {
  evaluateAndAssign,
  TRIGGER_EVENTS,
} from "@/server/services/finance-assignment-engine";
import { createNotification } from "@/server/services/notifications";
import {
  FinanceStatusTransitionError,
  recomputeFinanceStatus,
} from "@/server/services/record-finance-status";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { financeQueueRecordIdParamSchema } from "@/lib/validations/finance-queue";
import { reassignBodySchema } from "@/lib/validations/finance-reassignment";

const ALLOWED_FINANCE_RESPONSIBILITY = new Set<FinanceResponsibility>([
  "PROCESS",
  "PROCESS_AND_APPROVE",
]);

const INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION";

/**
 * POST /api/finance/assignments/[recordId]/reassign
 * C10 — Admin reassignment: Direct (target membership) or Evaluation (engine re-run).
 */
export const POST = withErrorHandler(async (
  req: Request,
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

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.financial_config.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const { recordId } = financeQueueRecordIdParamSchema.parse(await context.params);
  const body = await parseBody(req, reassignBodySchema);

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: {
      financeStatus: true,
      financeAssignedMembershipId: true,
      title: true,
    },
  });
  if (!record) {
    return ApiErrors.NOT_FOUND("Record");
  }

  if (record.financeStatus === FinanceStatus.COMPLETED) {
    return apiError(
      INVALID_STATE_TRANSITION,
      409,
      "Cannot reassign finance work that is already completed."
    );
  }

  const noteMeta = body.note ? { note: body.note } : {};

  if (body.targetMembershipId) {
    const targetMembershipId = body.targetMembershipId;
    const oldAssigneeId = record.financeAssignedMembershipId;

    if (oldAssigneeId !== null && oldAssigneeId === targetMembershipId) {
      return apiError("NOOP_REASSIGNMENT", 409, "Record is already assigned to this member.");
    }

    const target = await prisma.tenantMembership.findFirst({
      where: { id: targetMembershipId },
      select: {
        tenantId: true,
        status: true,
        financeResponsibility: true,
        userId: true,
      },
    });
    if (!target) {
      return ApiErrors.VALIDATION_ERROR("Membership not found.");
    }
    if (target.tenantId !== tenantId) {
      return ApiErrors.VALIDATION_ERROR("Membership does not belong to this workspace.");
    }
    if (target.status !== "ACTIVE") {
      return ApiErrors.VALIDATION_ERROR("Membership is not active.");
    }
    if (!ALLOWED_FINANCE_RESPONSIBILITY.has(target.financeResponsibility)) {
      return ApiErrors.VALIDATION_ERROR(
        "This member does not have finance processing responsibility.",
        { code: "MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY" }
      );
    }

    const emptySnapshot = [] as unknown as Prisma.InputJsonValue;

    let evaluationId: string;
    try {
      evaluationId = await prisma.$transaction(async (tx) => {
        await recomputeFinanceStatus(tx, {
          tenantId,
          recordId,
          newStatus: FinanceStatus.ASSIGNED,
          newAssigneeId: targetMembershipId,
          newAssignedAt: new Date(),
          newAssignedByRuleId: null,
          expectFromAssignee: oldAssigneeId,
          incrementMembershipId: targetMembershipId,
          ...(oldAssigneeId !== null ? { decrementMembershipId: oldAssigneeId } : {}),
        });

        const evaluation = await tx.financeAssignmentEvaluation.create({
          data: {
            tenantId,
            recordId,
            triggeredByEvent: "ADMIN_MANUAL_REASSIGN",
            triggeredByUserId: session.user.id,
            outcome: EvaluationOutcome.ASSIGNED,
            matchedRuleId: null,
            assignedMembershipId: targetMembershipId,
            rulesEvaluated: emptySnapshot,
            candidatesEvaluated: emptySnapshot,
            selectionStrategy: "MANUAL_REASSIGN",
            evaluationDurationMs: 0,
            errorMessage: null,
          },
          select: { id: true },
        });

        const eventMeta = {
          mode: "DIRECT" as const,
          oldAssigneeId,
          newAssigneeId: targetMembershipId,
          fromStatus: record.financeStatus,
          toStatus: "ASSIGNED" as const,
          ...noteMeta,
        };

        await tx.recordEvent.create({
          data: {
            tenantId,
            recordId,
            eventType: RecordEventType.FINANCE_REASSIGNED,
            actorUserId: session.user.id,
            metadata: eventMeta,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: session.user.id,
            actorContext: "TENANT",
            tenantId,
            action: "record.finance.reassigned",
            targetType: "Record",
            targetId: recordId,
            metadata: eventMeta,
          },
        });

        return evaluation.id;
      });
    } catch (err: unknown) {
      if (
        err instanceof FinanceStatusTransitionError &&
        err.reason === "INVALID_STATE_TRANSITION"
      ) {
        return apiError(
          INVALID_STATE_TRANSITION,
          409,
          "Record assignment changed concurrently or is invalid for this action."
        );
      }
      throw err;
    }

    try {
      await createNotification({
        userId: target.userId,
        type: NotificationType.RECORD_FINANCE_ASSIGNED,
        title: `New record assigned: ${record.title}`,
        entityType: "Record",
        entityId: recordId,
        actionUrl: `/app/queue/${recordId}`,
      });
    } catch (notifyErr) {
      console.error("[finance-reassignment] createNotification failed", {
        recordId,
        tenantId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    return apiSuccess({
      ok: true,
      mode: "DIRECT" as const,
      newAssigneeId: targetMembershipId,
      evaluationId,
    });
  }

  const oldAssigneeId = record.financeAssignedMembershipId;
  const fromStatus = record.financeStatus;

  if (oldAssigneeId !== null) {
    try {
      await prisma.$transaction(async (tx) => {
        await recomputeFinanceStatus(tx, {
          tenantId,
          recordId,
          newStatus: FinanceStatus.PENDING_ASSIGNMENT,
          newAssigneeId: null,
          newAssignedAt: null,
          newAssignedByRuleId: null,
          expectFromAssignee: oldAssigneeId,
          decrementMembershipId: oldAssigneeId,
        });

        const eventMeta = {
          mode: "EVALUATION" as const,
          oldAssigneeId,
          fromStatus,
          toStatus: "PENDING_ASSIGNMENT" as const,
          engineWillRun: true as const,
          ...noteMeta,
        };

        await tx.recordEvent.create({
          data: {
            tenantId,
            recordId,
            eventType: RecordEventType.FINANCE_REASSIGNED,
            actorUserId: session.user.id,
            metadata: eventMeta,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: session.user.id,
            actorContext: "TENANT",
            tenantId,
            action: "record.finance.reassigned",
            targetType: "Record",
            targetId: recordId,
            metadata: eventMeta,
          },
        });
      });
    } catch (err: unknown) {
      if (
        err instanceof FinanceStatusTransitionError &&
        err.reason === "INVALID_STATE_TRANSITION"
      ) {
        return apiError(
          INVALID_STATE_TRANSITION,
          409,
          "Record assignment changed concurrently or is invalid for this action."
        );
      }
      throw err;
    }
  }

  /**
   * Explicit admin intent: run the engine even when the record had no assignee or non-pending
   * finance status (e.g. NOT_REQUIRED). The engine produces the authoritative outcome snapshot
   * (including NO_RULE_MATCHED when nothing applies).
   */
  let engineOutcome: EvaluationOutcome | "ENGINE_ERROR" = "ENGINE_ERROR";
  let engineEvaluationId: string | null = null;
  try {
    const out = await evaluateAndAssign({
      tenantId,
      recordId,
      triggerEvent: TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION,
      triggeredByUserId: session.user.id,
    });
    engineOutcome = out.outcome;
    engineEvaluationId = out.evaluationId;
  } catch (engineErr) {
    console.error("[finance-reassignment] evaluateAndAssign failed", {
      recordId,
      tenantId,
      phase: "engine_error",
      error: engineErr instanceof Error ? engineErr.message : String(engineErr),
    });
    engineOutcome = "ENGINE_ERROR";
    engineEvaluationId = null;
  }

  return apiSuccess({
    ok: true,
    mode: "EVALUATION" as const,
    clearedOldAssigneeId: oldAssigneeId,
    engineOutcome,
    engineEvaluationId,
  });
});
