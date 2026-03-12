import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
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

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const permError = await requireTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.billing.manage",
  });
  if (permError) return permError;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { providerCustomerId: true },
  });
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: { providerCustomerId: true, providerSubscriptionId: true },
  });
  const providerCustomerId = tenant?.providerCustomerId ?? subscription?.providerCustomerId;

  if (!providerCustomerId) {
    return apiSuccess({ paymentMethod: null });
  }

  const paymentMethod = await getSubscriptionPaymentMethod({
    providerCustomerId,
    providerSubscriptionId: subscription?.providerSubscriptionId ?? undefined,
  });

  return apiSuccess({ paymentMethod });
});
