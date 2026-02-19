import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { getCustomerPortalLink } from "@/server/billing/providers/paddle/get-customer-portal-link";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenant?.id;
  if (!tenantId) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.billing.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: { providerCustomerId: true, providerSubscriptionId: true },
  });

  if (!subscription?.providerCustomerId) {
    return ApiErrors.VALIDATION_ERROR(
      "No Paddle subscription found for this workspace. Subscribe first to manage billing."
    );
  }

  const { url } = await getCustomerPortalLink({
    providerCustomerId: subscription.providerCustomerId,
    subscriptionIds: subscription.providerSubscriptionId
      ? [subscription.providerSubscriptionId]
      : undefined,
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.portal_accessed",
    targetType: "Subscription",
  });

  return apiSuccess({ url });
});
