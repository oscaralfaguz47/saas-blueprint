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

const paramsSchema = z.object({
  id: z.string().cuid(),
  linkId: z.string().cuid(),
});

/**
 * DELETE /api/records/[id]/links/[linkId]
 * G1 — Soft remove a link (sets removedAt, removedByUserId).
 */
export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string; linkId: string }> }
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
  const { id: recordId, linkId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const canLink = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.link",
  });
  if (!canLink) return ApiErrors.FORBIDDEN();

  const link = await prisma.recordLink.findFirst({
    where: {
      id: linkId,
      tenantId,
      removedAt: null,
      OR: [{ fromRecordId: recordId }, { toRecordId: recordId }],
    },
    select: { id: true, linkType: true },
  });
  if (!link) return ApiErrors.NOT_FOUND("Link");

  const now = new Date();

  const ok = await prisma.$transaction(async (tx) => {
    const upd = await tx.recordLink.updateMany({
      where: {
        id: linkId,
        tenantId,
        removedAt: null,
        OR: [{ fromRecordId: recordId }, { toRecordId: recordId }],
      },
      data: { removedAt: now, removedByUserId: session.user.id },
    });
    if (upd.count === 0) return false;

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "RECORD_UNLINKED",
        actorUserId: session.user.id,
        metadata: { linkId, linkType: link.linkType },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.unlinked",
        targetType: "RecordLink",
        targetId: linkId,
        metadata: { recordId, linkType: link.linkType },
      },
    });

    return true;
  });

  if (!ok) {
    return ApiErrors.CONFLICT("Link was already removed.");
  }

  return apiSuccess({ id: linkId, removed: true });
});
