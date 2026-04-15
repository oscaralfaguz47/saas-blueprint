import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { checkMeterLimit, tryConsumeMeter } from "@/server/billing/try-consume-meter";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const patchSchema = z.object({
  title: z.string().min(1).max(160).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  status: z.enum(["OPEN"]).optional(),
});

function commentIdFromEventMetadata(meta: unknown): string | undefined {
  if (meta && typeof meta === "object" && !Array.isArray(meta) && "commentId" in meta) {
    const v = (meta as Record<string, unknown>).commentId;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

/**
 * GET /api/records/[id]
 * B2 — Full record detail (summary, evidence, participants, timeline, comments, links, payment).
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

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

  const [record, evidence, participants, events, links, payment] = await Promise.all([
    prisma.record.findFirst({
      where: { id: recordId, tenantId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        description: true,
        clientName: true,
        clientEmail: true,
        amount: true,
        currency: true,
        visibility: true,
        isSensitive: true,
        closedAt: true,
        closedByUserId: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),

    prisma.recordEvidence.findMany({
      where: { recordId, tenantId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        evidenceType: true,
        label: true,
        url: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        createdByUserId: true,
      },
    }),

    prisma.recordParticipant.findMany({
      where: { recordId, tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        participantType: true,
        participantRole: true,
        status: true,
        userId: true,
        email: true,
        name: true,
        expiresAt: true,
        revokedAt: true,
        respondedAt: true,
        responseReason: true,
        createdAt: true,
      },
    }),

    prisma.recordEvent.findMany({
      where: { recordId, tenantId },
      orderBy: { occurredAt: "asc" },
      take: 100,
      select: {
        id: true,
        eventType: true,
        actorUserId: true,
        actorEmail: true,
        metadata: true,
        occurredAt: true,
        actorUser: {
          select: { name: true, email: true },
        },
      },
    }),

    prisma.recordLink.findMany({
      where: {
        tenantId,
        removedAt: null,
        OR: [{ fromRecordId: recordId }, { toRecordId: recordId }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        linkType: true,
        fromRecordId: true,
        toRecordId: true,
        createdAt: true,
      },
    }),

    prisma.recordPayment.findFirst({
      where: { recordId, tenantId },
      select: {
        id: true,
        status: true,
        setAt: true,
        setByUserId: true,
        evidence: {
          where: { removedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            evidenceType: true,
            label: true,
            versionNumber: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  if (!record) return ApiErrors.NOT_FOUND("Record");

  const commentIdSet = new Set<string>();
  for (const e of events) {
    if (e.eventType === "COMMENT_ADDED") {
      const cid = commentIdFromEventMetadata(e.metadata);
      if (cid) {
        const ok = z.string().cuid().safeParse(cid);
        if (ok.success) commentIdSet.add(cid);
      }
    }
  }
  const commentIds = Array.from(commentIdSet);

  const commentDetails =
    commentIds.length > 0
      ? await prisma.recordComment.findMany({
          where: { id: { in: commentIds }, tenantId, recordId },
          select: {
            id: true,
            authorType: true,
            authorUserId: true,
            authorEmail: true,
            commentScope: true,
            content: true,
            isCritical: true,
            createdAt: true,
          },
        })
      : [];

  const missingProof =
    payment?.status === "PAID" && (payment.evidence?.length ?? 0) === 0;

  return apiSuccess({
    record,
    evidence,
    participants,
    timeline: events.map(({ actorUser, ...e }) => ({
      ...e,
      actorName: actorUser?.name ?? null,
      actorDisplayEmail: actorUser?.email ?? e.actorEmail ?? null,
    })),
    comments: commentDetails,
    links,
    payment: payment ?? null,
    missingProof,
  });
});

/**
 * PATCH /api/records/[id]
 * Update record fields. Only the creator may update; drafts support title/description;
 * DRAFT → OPEN ("Submit") consumes one request against plan limits.
 */
export const PATCH = withErrorHandler(async (
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

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true, createdByUserId: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");

  if (record.createdByUserId !== session.user.id) return ApiErrors.FORBIDDEN();
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot update a closed record.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }
  const bodyResult = patchSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const body = bodyResult.data;

  const hasFieldUpdates =
    body.title !== undefined ||
    body.description !== undefined ||
    body.status !== undefined;
  if (!hasFieldUpdates) {
    return ApiErrors.VALIDATION_ERROR("No fields to update");
  }

  if (
    (body.title !== undefined || body.description !== undefined) &&
    record.status !== "DRAFT"
  ) {
    return ApiErrors.CONFLICT("Only draft requests can be edited.");
  }

  const isSubmitting = body.status === "OPEN" && record.status === "DRAFT";

  if (isSubmitting) {
    await checkMeterLimit({
      tenantId,
      meter: "REQUESTS",
      delta: 1,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.record.update({
      where: { id: recordId, tenantId },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
      select: { id: true, title: true, status: true },
    });

    if (isSubmitting) {
      await tx.recordEvent.create({
        data: {
          tenantId,
          recordId,
          eventType: "RECORD_CREATED",
          actorUserId: session.user.id,
          metadata: { submittedFromDraft: true },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId,
          action: "record.submitted",
          targetType: "Record",
          targetId: recordId,
          metadata: { previousStatus: "DRAFT", newStatus: "OPEN" },
        },
      });
    }

    return r;
  });

  if (isSubmitting) {
    await tryConsumeMeter({
      tenantId,
      meter: "REQUESTS",
      delta: 1,
      idempotencyKey: `record.submitted.${recordId}`,
      sourceType: "record.submitted",
      sourceId: recordId,
      actorUserId: session.user.id,
    });
  }

  return apiSuccess(updated);
});
