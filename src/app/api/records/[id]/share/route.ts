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

const shareBodySchema = z.object({
  userId: z.string().cuid("Invalid user id"),
  accessType: z.enum(["VIEW", "EDIT"]).default("VIEW"),
});

/**
 * POST /api/records/[id]/share
 * Grant explicit access (RecordAccess) to another tenant user.
 * Requires tenant.requests.share permission + access to the record.
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!actor || actor.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const actorHasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!actorHasAccess) return ApiErrors.NOT_FOUND("Record");

  const canShare = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.share",
  });
  if (!canShare) return ApiErrors.FORBIDDEN();

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = shareBodySchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { userId: targetUserId, accessType } = bodyResult.data;

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId: targetUserId } },
    select: { status: true },
  });
  if (!targetMembership || targetMembership.status !== "ACTIVE") {
    return ApiErrors.VALIDATION_ERROR("User is not an active member of this workspace");
  }

  await prisma.$transaction(async (tx) => {
    await tx.recordAccess.upsert({
      where: { recordId_userId: { recordId, userId: targetUserId } },
      create: {
        tenantId,
        recordId,
        userId: targetUserId,
        accessType,
        reason: "MANUAL_SHARE",
        grantedByUserId: session.user.id,
        grantedBySystem: false,
      },
      update: {
        accessType,
        grantedByUserId: session.user.id,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "RECORD_SHARED",
        actorUserId: session.user.id,
        metadata: {
          sharedWithUserId: targetUserId,
          accessType,
          reason: "MANUAL_SHARE",
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.shared",
        targetType: "Record",
        targetId: recordId,
        metadata: {
          sharedWithUserId: targetUserId,
          accessType,
        },
      },
    });
  });

  return apiSuccess({ recordId, userId: targetUserId, accessType }, 201);
});
