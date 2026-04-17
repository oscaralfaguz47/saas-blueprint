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

const addLinkSchema = z.object({
  evidenceType: z.literal("LINK"),
  label: z.string().min(1, "Label is required").max(255).trim(),
  url: z
    .string()
    .url("Must be a valid URL")
    .max(2048, "URL too long")
    .refine(
      (val) => val.startsWith("http://") || val.startsWith("https://"),
      "Only http:// and https:// URLs are allowed"
    ),
});

/**
 * GET /api/records/[id]/evidence
 * List active evidence for a record (deletedAt IS NULL).
 * Requires C1 access.
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

  const evidence = await prisma.recordEvidence.findMany({
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
  });

  return apiSuccess({ evidence });
});

/**
 * POST /api/records/[id]/evidence
 * Add a LINK evidence entry (D2).
 * FILE evidence uses a separate presigned-URL upload flow (see /evidence/upload-url).
 * Requires C1 access + tenant.evidence.add permission.
 * Blocked if record is CLOSED.
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
  const bodyResult = addLinkSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { label, url } = bodyResult.data;

  const evidence = await prisma.$transaction(async (tx) => {
    const ev = await tx.recordEvidence.create({
      data: {
        tenantId,
        recordId,
        evidenceType: "LINK",
        label,
        url,
        createdByUserId: session.user.id,
      },
      select: { id: true, evidenceType: true, label: true, url: true, createdAt: true },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "EVIDENCE_LINK_ADDED",
        actorUserId: session.user.id,
        metadata: { evidenceId: ev.id, label, url },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.evidence.link_added",
        targetType: "RecordEvidence",
        targetId: ev.id,
        metadata: { recordId, label, url },
      },
    });

    return ev;
  });

  return apiSuccess(evidence, 201);
});
