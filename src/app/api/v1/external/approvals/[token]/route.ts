import "server-only";

import { prisma } from "@/server/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";
import { z } from "zod";
import { createHash } from "crypto";

const paramsSchema = z.object({ token: z.string().min(1).max(128) });

const externalActionSchema = z.discriminatedUnion("action", [
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
  z.object({
    action: z.literal("VIEW"),
  }),
]);

/**
 * GET /api/v1/external/approvals/[token]
 * E3 — Load request summary for external approver (no login).
 * Validates token, updates lastUsedAt on first view, returns read-only record data.
 */
export const GET = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ token: string }> }
) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`external:approval:view:${ip}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.NOT_FOUND("Approval link");
  const { token } = parseResult.data;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const participant = await prisma.recordParticipant.findFirst({
    where: { tokenHash, participantType: "EXTERNAL" },
    select: {
      id: true,
      tenantId: true,
      recordId: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      record: {
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          requestedAmount: true,
          currencyCode: true,
          createdAt: true,
        },
      },
    },
  });

  if (!participant) return ApiErrors.NOT_FOUND("Approval link");
  if (participant.revokedAt) return ApiErrors.NOT_FOUND("Approval link");
  if (participant.expiresAt && participant.expiresAt < new Date()) {
    return ApiErrors.VALIDATION_ERROR("This approval link has expired.");
  }
  if (participant.record.status === "CLOSED") {
    return ApiErrors.CONFLICT("This request has been closed.");
  }

  await prisma.recordParticipant.updateMany({
    where: { id: participant.id, lastUsedAt: null },
    data: { lastUsedAt: new Date() },
  });

  const rec = participant.record;
  return apiSuccess({
    record: {
      id: rec.id,
      title: rec.title,
      type: rec.type,
      status: rec.status,
      requestedAmount:
        rec.requestedAmount != null ? Number(rec.requestedAmount) : null,
      currencyCode: rec.currencyCode,
      createdAt: rec.createdAt.toISOString(),
    },
    participantStatus: participant.status,
    expiresAt: participant.expiresAt,
  });
});

/**
 * POST /api/v1/external/approvals/[token]
 * E3 — External approver submits action (APPROVE | REJECT | COMMENT | VIEW).
 * No login required. Token validated server-side via SHA-256 hash.
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ token: string }> }
) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`external:approval:action:${ip}`, 10, 60 * 1000);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.NOT_FOUND("Approval link");
  const { token } = parseResult.data;

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = externalActionSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const body = bodyResult.data;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const participant = await prisma.recordParticipant.findFirst({
    where: { tokenHash, participantType: "EXTERNAL" },
    select: {
      id: true,
      tenantId: true,
      recordId: true,
      email: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      createdByUserId: true,
      record: { select: { createdByUserId: true, status: true } },
    },
  });

  if (!participant) return ApiErrors.NOT_FOUND("Approval link");
  if (participant.revokedAt) return ApiErrors.NOT_FOUND("Approval link");
  if (participant.expiresAt && participant.expiresAt < new Date()) {
    return ApiErrors.VALIDATION_ERROR("This approval link has expired.");
  }

  if (!participant.email) {
    return ApiErrors.NOT_FOUND("Approval link");
  }

  if (participant.record.status === "CLOSED") {
    return ApiErrors.CONFLICT("This request has been closed.");
  }

  const auditActorUserId =
    participant.createdByUserId ?? participant.record.createdByUserId;

  if (body.action === "VIEW") {
    await prisma.recordParticipant.update({
      where: { id: participant.id },
      data: { lastUsedAt: new Date() },
    });
    return apiSuccess({ viewed: true });
  }

  if (body.action === "COMMENT") {
    await prisma.$transaction(async (tx) => {
      await tx.recordComment.create({
        data: {
          tenantId: participant.tenantId,
          recordId: participant.recordId,
          authorType: "EXTERNAL",
          authorEmail: participant.email,
          commentScope: "APPROVAL",
          content: body.comment,
        },
      });

      await tx.recordEvent.create({
        data: {
          tenantId: participant.tenantId,
          recordId: participant.recordId,
          eventType: "COMMENT_ADDED",
          actorEmail: participant.email,
          metadata: {
            participantId: participant.id,
            commentScope: "APPROVAL",
            authorType: "EXTERNAL",
          },
        },
      });

      await tx.recordParticipant.update({
        where: { id: participant.id },
        data: { lastUsedAt: new Date() },
      });
    });

    return apiSuccess({ action: "COMMENT" });
  }

  if (participant.status !== "PENDING") {
    return ApiErrors.CONFLICT("Already responded to this approval request.");
  }

  const newStatus = body.action === "APPROVE" ? "APPROVED" : "REJECTED";
  const eventType = body.action === "APPROVE" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED";
  const auditAction =
    body.action === "APPROVE" ? "record.approval.approved" : "record.approval.rejected";
  const respondedAt = new Date();

  const responseReason =
    body.action === "APPROVE" ? (body.comment ?? null) : body.comment;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.recordParticipant.updateMany({
      where: {
        id: participant.id,
        tenantId: participant.tenantId,
        status: "PENDING",
      },
      data: {
        status: newStatus,
        respondedAt,
        responseReason,
        lastUsedAt: respondedAt,
      },
    });

    if (result.count === 0) return null;

    if (body.action === "REJECT") {
      await tx.recordComment.create({
        data: {
          tenantId: participant.tenantId,
          recordId: participant.recordId,
          authorType: "EXTERNAL",
          authorEmail: participant.email,
          commentScope: "APPROVAL",
          content: body.comment,
          isCritical: true,
        },
      });
    }

    await tx.recordEvent.create({
      data: {
        tenantId: participant.tenantId,
        recordId: participant.recordId,
        eventType,
        actorEmail: participant.email,
        metadata: {
          participantId: participant.id,
          action: body.action,
          comment: body.action === "REJECT" ? body.comment : (body.comment ?? null),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: auditActorUserId,
        actorContext: "TENANT",
        tenantId: participant.tenantId,
        action: auditAction,
        targetType: "RecordParticipant",
        targetId: participant.id,
        metadata: {
          recordId: participant.recordId,
          approverEmail: participant.email,
          action: body.action,
          performedByExternalApprover: true,
        },
      },
    });

    await recomputeApprovalStatus(tx, {
      tenantId: participant.tenantId,
      recordId: participant.recordId,
      triggeredByParticipantId: participant.id,
      triggeredByAction:
        body.action === "APPROVE" ? "EXTERNAL_APPROVED" : "EXTERNAL_REJECTED",
      actorUserId: auditActorUserId,
      actorEmail: participant.email,
    });

    return result;
  });

  if (!updated) {
    return ApiErrors.CONFLICT("Already responded to this approval request.");
  }

  return apiSuccess({ action: body.action, status: newStatus, respondedAt });
});
