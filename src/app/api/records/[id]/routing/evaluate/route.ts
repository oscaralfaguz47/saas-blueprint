import "server-only";

import { getServerSession } from "next-auth";
import {
  ApprovalRoutingOutcome,
  RecordEventType,
  type RecordParticipantStatus,
} from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ApiErrors, apiError, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { requireFullSession } from "@/server/require-full-session";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import {
  APPROVAL_ROUTING_TRIGGER_EVENTS,
  evaluateAndAssign,
} from "@/server/services/approval-routing-engine";
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";
import { NextResponse } from "next/server";

const paramsSchema = z.object({
  id: z.string().cuid(),
});

const bodySchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .strict();

export type ApprovalRoutingReevaluateResponseData = {
  clearedCount: number;
  engineOutcome: ApprovalRoutingOutcome | "SKIPPED";
  evaluationId: string | null;
  warning?: string;
};

/**
 * POST /api/records/[id]/routing/evaluate
 * C14 — Admin manual approval routing re-evaluation (clear routing-owned pendings, then engine).
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
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
    permission: "tenant.approval_routing.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const paramsParse = paramsSchema.safeParse(await context.params);
  if (!paramsParse.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid record id");
  }
  const { id: recordId } = paramsParse.data;

  let body: z.infer<typeof bodySchema>;
  try {
    body = await parseBody(req, bodySchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: {
      id: true,
      status: true,
      approvalStatus: true,
    },
  });
  if (!record) {
    return ApiErrors.NOT_FOUND("Record");
  }

  if (record.status !== "OPEN") {
    return apiError("INVALID_RECORD_STATUS", 409, "Record must be open to re-evaluate approval routing.", {
      code: "INVALID_RECORD_STATUS",
    });
  }

  if (record.approvalStatus === "FULLY_APPROVED" || record.approvalStatus === "APPROVAL_REJECTED") {
    return apiError(
      "APPROVAL_STATUS_TERMINAL",
      409,
      "Cannot re-evaluate approval routing for a terminal approval status.",
      { code: "APPROVAL_STATUS_TERMINAL" }
    );
  }

  const plan = await resolveTenantPlan(tenantId);
  if (!plan.features.approvalRouting.enabled) {
    return ApiErrors.UPGRADE_REQUIRED("Approval routing is not available on your plan.");
  }

  const now = new Date();
  const clearWhere = {
    tenantId,
    recordId,
    participantRole: "APPROVER" as const,
    routingRuleId: { not: null },
    revokedAt: null,
    status: { in: ["PENDING", "PENDING_BLOCKED"] satisfies RecordParticipantStatus[] },
  };

  let clearedCount = 0;
  let participantIds: string[] = [];
  let sequenceOrders: (number | null)[] = [];

  await prisma.$transaction(async (tx) => {
    const rows = await tx.recordParticipant.findMany({
      where: clearWhere,
      select: { id: true, sequenceOrder: true },
    });
    const upd = await tx.recordParticipant.updateMany({
      where: clearWhere,
      data: { revokedAt: now },
    });
    clearedCount = upd.count;
    participantIds = rows.map((r) => r.id);
    sequenceOrders = rows.map((r) => r.sequenceOrder ?? null);

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: RecordEventType.APPROVERS_CLEARED,
        actorUserId: session.user.id,
        metadata: {
          clearedCount,
          note: body.note ?? null,
          participantIds,
          sequenceOrders,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.approval_routing.cleared",
        targetType: "Record",
        targetId: recordId,
        metadata: {
          clearedCount,
          note: body.note ?? null,
          participantIds,
          sequenceOrders,
        },
      },
    });

    await recomputeApprovalStatus(tx, {
      tenantId,
      recordId,
      triggeredByAction: "PARTICIPANT_REVOKED",
      actorUserId: session.user.id,
    });
  });

  let engineOutcome: ApprovalRoutingOutcome | "SKIPPED" = "SKIPPED";
  let evaluationId: string | null = null;
  let warning: string | undefined;

  try {
    const engine = await evaluateAndAssign({
      tenantId,
      recordId,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION,
      triggeredByUserId: session.user.id,
    });

    if (engine.skipped) {
      engineOutcome = "SKIPPED";
      evaluationId = null;
    } else {
      engineOutcome = engine.outcome;
      evaluationId = engine.evaluationId;
    }
  } catch (err) {
    console.error("[c14-reevaluate] engine failed", {
      recordId,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    warning = "Engine evaluation failed but clear phase succeeded";
    engineOutcome = "SKIPPED";
    evaluationId = null;
  }

  const data: ApprovalRoutingReevaluateResponseData = {
    clearedCount,
    engineOutcome,
    evaluationId,
    ...(warning ? { warning } : {}),
  };

  return NextResponse.json({ success: true as const, data }, { status: 200 });
});
