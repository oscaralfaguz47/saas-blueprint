import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getTenantPermissions } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/** GET /api/tenant/permissions — current user's permissions for default tenant (for UI gating). */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenantId;
  if (!tenantId) return apiSuccess({ permissions: [] });

  const permissions = await getTenantPermissions({
    userId: session.user.id,
    tenantId,
  });

  return apiSuccess({ permissions });
});
