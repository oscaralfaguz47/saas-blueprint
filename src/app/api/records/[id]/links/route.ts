import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const createLinkSchema = z.object({
  toRecordId: z.string().cuid("Invalid record id"),
  linkType: z.enum(["FULFILLS", "RELATED"]),
});

/**
 * GET /api/records/[id]/links
 * List active links for a record (both directions).
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

  const links = await prisma.recordLink.findMany({
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
      createdByUserId: true,
    },
  });

  return apiSuccess({ links });
});

/**
 * POST /api/records/[id]/links
 * G1 — Link this record to another existing record.
 * RELATED links use canonical ordering (lexicographic cuid order).
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

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = createLinkSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { toRecordId, linkType } = bodyResult.data;

  if (recordId === toRecordId) {
    return ApiErrors.VALIDATION_ERROR("A record cannot be linked to itself.");
  }

  const [hasAccessFrom, hasAccessTo] = await Promise.all([
    canAccessRequest({ tenantId, userId: session.user.id, requestId: recordId }),
    canAccessRequest({ tenantId, userId: session.user.id, requestId: toRecordId }),
  ]);
  if (!hasAccessFrom) return ApiErrors.NOT_FOUND("Record");
  if (!hasAccessTo) return ApiErrors.NOT_FOUND("Target record");

  const canLink = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.link",
  });
  if (!canLink) return ApiErrors.FORBIDDEN();

  const targetRecord = await prisma.record.findFirst({
    where: { id: toRecordId, tenantId },
    select: { id: true, status: true },
  });
  if (!targetRecord) return ApiErrors.NOT_FOUND("Target record");

  const sourceRecord = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!sourceRecord) return ApiErrors.NOT_FOUND("Record");
  if (sourceRecord.status === "CLOSED" || targetRecord.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot add links to or from a closed record.");
  }

  let fromRecordId = recordId;
  let resolvedToRecordId = toRecordId;
  if (linkType === "RELATED" && recordId > toRecordId) {
    fromRecordId = toRecordId;
    resolvedToRecordId = recordId;
  }

  const existing = await prisma.recordLink.findFirst({
    where: {
      tenantId,
      linkType,
      fromRecordId,
      toRecordId: resolvedToRecordId,
      removedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    return apiSuccess({ id: existing.id, alreadyLinked: true }, 200);
  }

  const link = await prisma.$transaction(async (tx) => {
    const l = await tx.recordLink.create({
      data: {
        tenantId,
        linkType,
        fromRecordId,
        toRecordId: resolvedToRecordId,
        createdByUserId: session.user.id,
      },
      select: {
        id: true,
        linkType: true,
        fromRecordId: true,
        toRecordId: true,
        createdAt: true,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "RECORD_LINKED",
        actorUserId: session.user.id,
        metadata: {
          linkId: l.id,
          linkType,
          fromRecordId,
          toRecordId: resolvedToRecordId,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.linked",
        targetType: "RecordLink",
        targetId: l.id,
        metadata: { recordId, toRecordId: resolvedToRecordId, linkType },
      },
    });

    return l;
  });

  return apiSuccess(link, 201);
});
