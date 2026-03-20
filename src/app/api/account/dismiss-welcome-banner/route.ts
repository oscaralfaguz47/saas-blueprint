import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership) return ApiErrors.NOT_FOUND("Workspace");

  await prisma.tenantMembership.update({
    where: {
      tenantId_userId: {
        tenantId: membership.tenant.id,
        userId: session.user.id,
      },
    },
    data: { welcomeBannerDismissedAt: new Date() },
  });

  return apiSuccess({ ok: true });
});
