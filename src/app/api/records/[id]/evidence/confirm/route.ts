import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import {
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  isAllowedMimeType,
} from "@/lib/evidence-config";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const confirmSchema = z.object({
  objectKey: z.string().min(1).max(512),
  fileName: z.string().min(1).max(255).trim(),
  mimeType: z
    .string()
    .min(1)
    .max(120)
    .refine(isAllowedMimeType, "File type not allowed"),
  sizeBytes: z.number().int().min(0).max(MAX_EVIDENCE_FILE_SIZE_BYTES),
  label: z.string().max(255).trim().optional(),
  sha256: z.string().length(64).optional(),
});

/**
 * POST /api/records/[id]/evidence/confirm
 * D1 — Confirm a file evidence upload after direct R2 upload.
 * Validates objectKey is scoped to this tenant+record, then persists metadata.
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
  const bodyResult = confirmSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { objectKey, fileName, mimeType, sizeBytes, label, sha256 } = bodyResult.data;

  const expectedPrefix = `tenant/${tenantId}/records/${recordId}/evidence/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    return ApiErrors.VALIDATION_ERROR("Invalid object key.");
  }

  const evidence = await prisma.$transaction(async (tx) => {
    const ev = await tx.recordEvidence.create({
      data: {
        tenantId,
        recordId,
        evidenceType: "FILE",
        label: label ?? fileName,
        storageProvider: "r2",
        objectKey,
        fileName,
        mimeType,
        sizeBytes,
        sha256: sha256 ?? null,
        createdByUserId: session.user.id,
      },
      select: {
        id: true,
        evidenceType: true,
        label: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "EVIDENCE_FILE_ADDED",
        actorUserId: session.user.id,
        metadata: {
          evidenceId: ev.id,
          fileName,
          mimeType,
          sizeBytes,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.evidence.file_added",
        targetType: "RecordEvidence",
        targetId: ev.id,
        metadata: { recordId, fileName, mimeType, sizeBytes },
      },
    });

    return ev;
  });

  return apiSuccess(evidence, 201);
});
