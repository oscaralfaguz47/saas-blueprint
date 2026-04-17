import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import {
  buildRecordEvidenceObjectKey,
  getPresignedPutUrlRecordEvidence,
  isR2Configured,
} from "@/server/services/r2-profile-photo";
import {
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  isAllowedMimeType,
} from "@/lib/evidence-config";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255).trim(),
  mimeType: z.string().refine(isAllowedMimeType, "File type not allowed"),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(MAX_EVIDENCE_FILE_SIZE_BYTES, "File exceeds maximum size of 25 MB"),
});

/**
 * POST /api/records/[id]/evidence/upload-url
 * D1 — Generate a presigned R2 upload URL for file evidence.
 * Client uploads directly to R2, then calls /evidence/confirm.
 * Requires C1 access + tenant.evidence.add + record not CLOSED.
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

  const canAdd = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.evidence.add",
  });
  if (!canAdd) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot add evidence to a closed record.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = uploadUrlSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { fileName, mimeType, sizeBytes } = bodyResult.data;

  if (!isR2Configured()) {
    return ApiErrors.INTERNAL_ERROR("File storage is not configured.");
  }

  const { objectKey, evidenceUploadId } = buildRecordEvidenceObjectKey(
    tenantId,
    recordId,
    fileName
  );

  const signed = await getPresignedPutUrlRecordEvidence({
    objectKey,
    contentType: mimeType,
    contentLength: sizeBytes,
  });
  if (!signed) {
    return ApiErrors.INTERNAL_ERROR("Failed to generate upload URL.");
  }

  return apiSuccess({
    uploadUrl: signed.uploadUrl,
    objectKey: signed.objectKey,
    evidenceId: evidenceUploadId,
    expiresInSeconds: signed.expiresInSeconds,
  });
});
