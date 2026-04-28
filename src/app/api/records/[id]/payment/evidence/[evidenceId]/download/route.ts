import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { getPresignedGetUrlProfilePhoto } from "@/server/services/r2-profile-photo";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().cuid(),
  evidenceId: z.string().cuid(),
});

/**
 * GET /api/records/[id]/payment/evidence/[evidenceId]/download
 * Presigned download URL for FILE payment evidence.
 */
export const GET = withErrorHandler(async (
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

  // Allow access even if removed (removedAt != null) — timeline history
  const evidence = await prisma.recordPaymentEvidence.findFirst({
    where: { id: evidenceId, recordId, tenantId, evidenceType: "FILE" },
    select: { id: true, objectKey: true, fileName: true },
  });
  if (!evidence) return ApiErrors.NOT_FOUND("Payment evidence");
  if (!evidence.objectKey) {
    return ApiErrors.VALIDATION_ERROR("This evidence is not a downloadable file.");
  }

  const downloadUrl = await getPresignedGetUrlProfilePhoto(evidence.objectKey);
  if (!downloadUrl) {
    return ApiErrors.INTERNAL_ERROR("Download is temporarily unavailable.");
  }

  return apiSuccess({
    downloadUrl,
    fileName: evidence.fileName ?? "file",
  });
});
