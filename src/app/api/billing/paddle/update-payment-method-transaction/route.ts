import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { getUpdatePaymentMethodTransaction } from "@/server/billing/providers/paddle/get-update-payment-method-transaction";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * POST /api/billing/paddle/update-payment-method-transaction
 * Returns a transaction ID to open Paddle Checkout in overlay mode for updating payment method (in-app modal).
 * Requires auth + tenant.billing.manage.
 */
export const POST = withErrorHandler(async (req: Request) => {
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

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: { providerSubscriptionId: true },
  });

  if (!subscription?.providerSubscriptionId) {
    return ApiErrors.VALIDATION_ERROR(
      "No Paddle subscription found for this workspace. Subscribe first to update payment method."
    );
  }

  const { transactionId } = await getUpdatePaymentMethodTransaction({
    providerSubscriptionId: subscription.providerSubscriptionId,
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.portal_accessed",
    targetType: "Subscription",
    metadata: { mode: "update_payment_method_overlay" },
  });

  return apiSuccess({ transactionId });
});
