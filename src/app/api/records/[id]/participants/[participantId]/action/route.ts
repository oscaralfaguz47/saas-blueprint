import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().cuid(),
  participantId: z.string().cuid(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("APPROVE"),
    comment: z.string().max(2000).trim().optional(),
  }),
  z.object({
    action: z.literal("REJECT"),
    comment: z
      .string()
      .min(1, "Rejection comment is required")
      .max(2000)
      .trim(),
  }),
  z.object({
    action: z.literal("COMMENT"),
    comment: z.string().min(1, "Comment is required").max(2000).trim(),
  }),
]);

/**
 * POST /api/records/[id]/participants/[participantId]/action
 * E2 — Internal approver action: APPROVE | REJECT | COMMENT.
 * Only the assigned internal participant can act.
 * Atomic predicate update: only succeeds if participant.status = PENDING.
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string; participantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { id: recordId, participantId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const participant = await prisma.recordParticipant.findFirst({
    where: {
      id: participantId,
      recordId,
      tenantId,
      participantType: "INTERNAL",
      participantRole: "APPROVER",
      userId: session.user.id,
      revokedAt: null,
    },
    select: { id: true, status: true },
  });
  if (!participant) return ApiErrors.NOT_FOUND("Participant");

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Record is closed. Approval actions are not allowed.");
  }

  if (participant.status !== "PENDING") {
    return ApiErrors.CONFLICT("Already responded to this approval request.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = actionSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const body = bodyResult.data;

  const respondedAt = new Date();

  if (body.action === "COMMENT") {
    await prisma.$transaction(async (tx) => {
      await tx.recordComment.create({
        data: {
          tenantId,
          recordId,
          authorType: "INTERNAL",
          authorUserId: session.user.id,
          commentScope: "APPROVAL",
          content: body.comment,
        },
      });

      await tx.recordEvent.create({
        data: {
          tenantId,
          recordId,
          eventType: "COMMENT_ADDED",
          actorUserId: session.user.id,
          metadata: { participantId, commentScope: "APPROVAL" },
        },
      });
    });

    return apiSuccess({ action: "COMMENT", participantId });
  }

  const newStatus = body.action === "APPROVE" ? "APPROVED" : "REJECTED";
  const eventType = body.action === "APPROVE" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED";
  const auditAction =
    body.action === "APPROVE" ? "record.approval.approved" : "record.approval.rejected";

  const responseReason =
    body.action === "APPROVE" ? (body.comment ?? null) : body.comment;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.recordParticipant.updateMany({
      where: {
        id: participantId,
        recordId,
        tenantId,
        status: "PENDING",
        revokedAt: null,
      },
      data: {
        status: newStatus,
        respondedAt,
        responseReason,
      },
    });

    if (result.count === 0) return null;

    if (body.action === "REJECT") {
      await tx.recordComment.create({
        data: {
          tenantId,
          recordId,
          authorType: "INTERNAL",
          authorUserId: session.user.id,
          commentScope: "APPROVAL",
          content: body.comment,
          isCritical: true,
        },
      });
    }

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType,
        actorUserId: session.user.id,
        metadata: {
          participantId,
          action: body.action,
          comment: body.action === "APPROVE" ? (body.comment ?? null) : body.comment,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: auditAction,
        targetType: "RecordParticipant",
        targetId: participantId,
        metadata: {
          recordId,
          action: body.action,
          comment: body.action === "APPROVE" ? (body.comment ?? null) : body.comment,
        },
      },
    });

    await recomputeApprovalStatus(tx, {
      tenantId,
      recordId,
      triggeredByParticipantId: participantId,
      triggeredByAction:
        body.action === "APPROVE" ? "INTERNAL_APPROVED" : "INTERNAL_REJECTED",
      actorUserId: session.user.id,
    });

    return result;
  });

  if (!updated) {
    return ApiErrors.CONFLICT("Already responded to this approval request.");
  }

  return apiSuccess({ action: body.action, status: newStatus, respondedAt });
});
