import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { getSubscriptionPaymentMethod } from "@/server/billing/providers/paddle/get-subscription-payment-method";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * GET /api/billing/paddle/payment-method
 * Returns the current payment method on file for the tenant's Paddle subscription (brand, last4, expiry).
 * For display only. Requires auth + tenant.billing.manage.
 */
export const GET = withErrorHandler(async (req: Request) => {
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
    return apiSuccess({ paymentMethod: null });
  }

  const paymentMethod = await getSubscriptionPaymentMethod({
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId ?? undefined,
  });

  return apiSuccess({ paymentMethod });
});
