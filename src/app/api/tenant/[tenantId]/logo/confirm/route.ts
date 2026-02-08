import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { writeAuditLog } from "@/server/services/audit";
import { deleteLogoObject, doesObjectExist, isR2Configured } from "@/server/services/r2-logo";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, logoConfirmSchema } from "@/lib/validations";
import { z } from "zod";

const tenantIdParamSchema = z.object({ tenantId: z.string().cuid() });

/**
 * POST /api/tenant/[tenantId]/logo/confirm
 * After client uploads to R2 via presigned URL, confirm and save objectKey to Tenant.
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
    select: { id: true, logoObjectKey: true },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

  if (!isR2Configured()) {
    return ApiErrors.INTERNAL_ERROR("Logo upload is not configured.");
  }

  const body = await parseBody(req, logoConfirmSchema);

  const expectedPrefix = `tenants/${tenantId}/logo/`;
  if (!body.objectKey.startsWith(expectedPrefix)) {
    return ApiErrors.VALIDATION_ERROR("Invalid object key for this workspace.");
  }

  const exists = await doesObjectExist(body.objectKey);
  if (!exists) {
    return ApiErrors.VALIDATION_ERROR("Upload not found. Please upload the file first.");
  }

  const previousKey = tenant.logoObjectKey;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { logoObjectKey: body.objectKey },
  });

  if (previousKey && previousKey !== body.objectKey) {
    try {
      await deleteLogoObject(previousKey);
    } catch (err) {
      console.error("[api/tenant/logo/confirm] failed to delete previous logo object:", err);
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.logo.updated",
    targetType: "Tenant",
    targetId: tenantId,
    metadata: { objectKey: body.objectKey, previousObjectKey: previousKey ?? undefined },
  });

  return apiSuccess({ objectKey: body.objectKey });
});
