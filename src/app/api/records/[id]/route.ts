import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

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
    timeline: events,
    comments: commentDetails,
    links,
    payment: payment ?? null,
    missingProof,
  });
});

/**
 * PATCH /api/records/[id]
 * Stub for future field updates — closed records cannot be modified.
 */
export const PATCH = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const patchActor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!patchActor || patchActor.isPlatformBlocked) return ApiErrors.FORBIDDEN();

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
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");

  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("This record is closed and cannot be modified.");
  }

  return apiError(
    "NOT_IMPLEMENTED",
    501,
    "Record field updates are not implemented yet."
  );
});
