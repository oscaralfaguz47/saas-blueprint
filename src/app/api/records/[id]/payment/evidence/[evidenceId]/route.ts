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
  evidenceId: z.string().cuid(),
});

/**
 * DELETE /api/records/[id]/payment/evidence/[evidenceId]
 * H2 — Soft remove payment evidence.
 */
export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string; evidenceId: string }> }
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
  const { id: recordId, evidenceId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const canManage = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.payments.manage",
  });
  if (!canManage) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot remove payment evidence from a closed record.");
  }

  const evidence = await prisma.recordPaymentEvidence.findFirst({
    where: { id: evidenceId, recordId, tenantId, removedAt: null },
    select: { id: true, evidenceType: true, versionNumber: true },
  });
  if (!evidence) return ApiErrors.NOT_FOUND("Payment evidence");

  const now = new Date();

  const ok = await prisma.$transaction(async (tx) => {
    const upd = await tx.recordPaymentEvidence.updateMany({
      where: { id: evidenceId, recordId, tenantId, removedAt: null },
      data: { removedAt: now, removedByUserId: session.user.id },
    });
    if (upd.count === 0) return false;

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "PAYMENT_EVIDENCE_REMOVED",
        actorUserId: session.user.id,
        metadata: {
          evidenceId,
          evidenceType: evidence.evidenceType,
          versionNumber: evidence.versionNumber,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.payment.evidence_removed",
        targetType: "RecordPaymentEvidence",
        targetId: evidenceId,
        metadata: { recordId, evidenceType: evidence.evidenceType },
      },
    });

    return true;
  });

  if (!ok) {
    return ApiErrors.CONFLICT("Evidence was already removed.");
  }

  return apiSuccess({ id: evidenceId, removed: true });
});
