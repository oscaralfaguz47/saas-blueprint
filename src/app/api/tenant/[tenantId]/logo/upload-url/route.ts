import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { getPresignedPutUrl, buildLogoObjectKey, isR2Configured } from "@/server/services/r2-logo";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, logoUploadUrlSchema } from "@/lib/validations";
import { z } from "zod";
import { prisma } from "@/server/db";

const tenantIdParamSchema = z.object({ tenantId: z.string().cuid() });

/**
 * POST /api/tenant/[tenantId]/logo/upload-url
 * Returns a short-lived presigned PUT URL for direct upload to R2.
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const { tenantId } = tenantIdParamSchema.parse(await context.params);

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.settings.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

  if (!isR2Configured()) {
    return apiError("SERVICE_UNAVAILABLE", 503, "Logo upload is not configured. Set R2_* environment variables.");
  }

  const body = await parseBody(req, logoUploadUrlSchema);

  const objectKey = buildLogoObjectKey(tenantId, body.extension);
  const result = await getPresignedPutUrl({
    objectKey,
    contentType: body.contentType,
  });

  if (!result) {
    return apiError("SERVICE_UNAVAILABLE", 503, "Failed to generate upload URL.");
  }

  return apiSuccess({
    uploadUrl: result.uploadUrl,
    objectKey: result.objectKey,
  });
});
