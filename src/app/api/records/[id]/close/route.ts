import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { buildRecordClosedData } from "@/server/webhooks/event-builders";
import { enqueueWebhookEvent } from "@/server/webhooks/enqueue";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const closeBodySchema = z.object({
  closeReason: z
    .enum([
      "APPROVED_AND_COMPLETED",
      "REJECTED",
      "WITHDRAWN_BY_REQUESTER",
      "DUPLICATE",
      "SUPERSEDED",
      "NO_ACTION_REQUIRED",
      "PAID_OR_SETTLED",
      "CANCELED",
      "OTHER",
    ])
    .optional(),
  closeReasonNotes: z.string().max(1000).trim().optional(),
});

/**
 * POST /api/records/[id]/close
 * B3 — Close a record (OPEN → CLOSED).
 *
 * Authorization: user must have access to the record (C1)
 * AND permission tenant.requests.close.
 *
 * State transition: only OPEN → CLOSED is valid.
 * Already-CLOSED: idempotent success (no duplicate events).
 * Other statuses: 409 conflict.
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
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const canClose = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.close",
  });
  if (!canClose) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");

  if (record.status === "CLOSED") {
    return apiSuccess({ id: recordId, status: "CLOSED", alreadyClosed: true });
  }

  if (record.status !== "OPEN") {
    return ApiErrors.CONFLICT(
      `Cannot close a record with status "${record.status}". Only OPEN records can be closed.`
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  let closeBody: z.infer<typeof closeBodySchema> = {};
  if (contentType.toLowerCase().includes("application/json")) {
    const text = await req.text();
    if (text.trim()) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return ApiErrors.VALIDATION_ERROR("Invalid request body format");
      }
      const parsed = closeBodySchema.safeParse(json);
      if (!parsed.success) {
        return ApiErrors.VALIDATION_ERROR("Validation failed", parsed.error.flatten());
      }
      closeBody = parsed.data;
    }
  }

  const closedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.record.updateMany({
      where: { id: recordId, tenantId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closedAt,
        closedByUserId: session.user.id,
        ...(closeBody.closeReason != null ? { closeReason: closeBody.closeReason } : {}),
        ...(closeBody.closeReasonNotes != null
          ? { closeReasonNotes: closeBody.closeReasonNotes }
          : {}),
      },
    });

    if (result.count === 0) return null;

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "RECORD_CLOSED",
        actorUserId: session.user.id,
        metadata: {
          previousStatus: "OPEN",
          newStatus: "CLOSED",
          ...(closeBody.closeReason != null ? { closeReason: closeBody.closeReason } : {}),
          ...(closeBody.closeReasonNotes != null
            ? { closeReasonNotes: closeBody.closeReasonNotes }
            : {}),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.closed",
        targetType: "Record",
        targetId: recordId,
        metadata: {
          previousStatus: "OPEN",
          newStatus: "CLOSED",
          closedByUserId: session.user.id,
          ...(closeBody.closeReason != null ? { closeReason: closeBody.closeReason } : {}),
          ...(closeBody.closeReasonNotes != null
            ? { closeReasonNotes: closeBody.closeReasonNotes }
            : {}),
        },
      },
    });

    return result;
  });

  if (!updated) {
    return apiSuccess({ id: recordId, status: "CLOSED", alreadyClosed: true });
  }

  try {
    await enqueueWebhookEvent({
      tenantId,
      eventName: "record.closed",
      recordId,
      occurredAt: closedAt,
      data: buildRecordClosedData({
        recordId,
        closedAt,
        closedByUserId: session.user.id,
      }),
    });
  } catch (webhookErr) {
    console.error("[records/close] webhook enqueue defensive catch", {
      recordId,
      tenantId,
      error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
    });
  }

  return apiSuccess({ id: recordId, status: "CLOSED", closedAt });
});
