import "server-only";

import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import {
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
 * POST /api/records/[id]/payment/evidence/upload-url
 * Generate a presigned R2 upload URL for payment evidence FILE upload.
 * Client uploads directly to R2, then calls /payment/evidence/confirm.
 * Requires C1 access + tenant.payments.manage + record not CLOSED + has amount.
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

  const canManage = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.payments.manage",
  });
  if (!canManage) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true, requestedAmount: true, amount: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot add payment evidence to a closed record.");
  }

  const effectiveAmount =
    record.requestedAmount != null
      ? Number(record.requestedAmount)
      : record.amount != null
        ? Number(record.amount)
        : null;
  if (!effectiveAmount || effectiveAmount <= 0) {
    return ApiErrors.VALIDATION_ERROR(
      "Payment tracking is only available for requests with a requested amount."
    );
  }

  if (!isR2Configured()) {
    return ApiErrors.INTERNAL_ERROR("File storage is not configured.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = uploadUrlSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { fileName, mimeType, sizeBytes } = bodyResult.data;

  const uniqueId = randomUUID();
  const ext = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const objectKey = `tenant/${tenantId}/records/${recordId}/payment-evidence/${uniqueId}${ext ? `.${ext}` : ""}`;

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
    expiresInSeconds: signed.expiresInSeconds,
  });
});
