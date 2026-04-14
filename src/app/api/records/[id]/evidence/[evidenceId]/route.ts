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
 * DELETE /api/records/[id]/evidence/[evidenceId]
 * D1/D2 — Soft-delete evidence (sets deletedAt, deletedByUserId).
 * Requires C1 access + tenant.evidence.add. Blocked if record is CLOSED.
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

  const canMutateEvidence = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.evidence.add",
  });
  if (!canMutateEvidence) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot remove evidence from a closed record.");
  }

  const evidence = await prisma.recordEvidence.findFirst({
    where: { id: evidenceId, recordId, tenantId, deletedAt: null },
    select: { id: true, evidenceType: true },
  });
  if (!evidence) return ApiErrors.NOT_FOUND("Evidence");

  const now = new Date();

  const ok = await prisma.$transaction(async (tx) => {
    const upd = await tx.recordEvidence.updateMany({
      where: { id: evidenceId, recordId, tenantId, deletedAt: null },
      data: {
        deletedAt: now,
        deletedByUserId: session.user.id,
      },
    });
    if (upd.count === 0) return false;

    const eventType =
      evidence.evidenceType === "FILE"
        ? "EVIDENCE_FILE_REMOVED"
        : "EVIDENCE_LINK_REMOVED";

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType,
        actorUserId: session.user.id,
        metadata: { evidenceId },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.evidence.removed",
        targetType: "RecordEvidence",
        targetId: evidenceId,
        metadata: { recordId, evidenceType: evidence.evidenceType },
      },
    });

    return true;
  });

  if (!ok) {
    return ApiErrors.CONFLICT("Evidence was already removed or updated.");
  }

  return apiSuccess({ id: evidenceId, deleted: true });
});
