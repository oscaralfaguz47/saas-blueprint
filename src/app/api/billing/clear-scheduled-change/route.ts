import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { clearScheduledChangeOnly } from "@/server/billing/paddle/subscriptions/clear-scheduled-change";
import { updateSubscriptionPrice } from "@/server/billing/paddle/subscriptions/update-subscription-price";
import { writeAuditLog } from "@/server/services/audit";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const PAID_PLANS = ["starter", "pro", "enterprise"] as const;
function isPaidPlan(code: string): code is "starter" | "pro" | "enterprise" {
  return PAID_PLANS.includes(code as (typeof PAID_PLANS)[number]);
}

/**
 * POST /api/billing/clear-scheduled-change
 *
 * Clears the scheduled change on the tenant's Paddle subscription (either scheduled
 * cancellation or scheduled downgrade). The subscription continues on the current
 * active plan. Requires tenant.billing.manage.
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
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      providerSubscriptionId: true,
      cancelAtPeriodEnd: true,
      pendingPlanCode: true,
      currentEntitlementPlanCode: true,
      plan: { select: { code: true } },
    },
  });

  const currentCode = (
    subscription?.currentEntitlementPlanCode ??
    subscription?.plan?.code ??
    "free"
  ).toLowerCase();

  if (!subscription?.providerSubscriptionId) {
    return apiSuccess({ cleared: false, reason: "no_subscription" });
  }

  const hasScheduledCancellation =
    subscription.cancelAtPeriodEnd && subscription.pendingPlanCode === "free";
  const hasScheduledDowngrade =
    Boolean(subscription.pendingPlanCode) &&
    subscription.pendingPlanCode?.toLowerCase() !== currentCode;

  if (!hasScheduledCancellation && !hasScheduledDowngrade) {
    return apiSuccess({ cleared: false, reason: "no_scheduled_change" });
  }

  const clearResult = await clearScheduledChangeOnly(subscription.providerSubscriptionId);
  if (!clearResult.ok) {
    return ApiErrors.VALIDATION_ERROR(
      clearResult.error ?? "Failed to clear scheduled change. Try again or contact support."
    );
  }

  // Update Paddle subscription items to the current (kept) plan so Paddle shows and bills the correct plan.
  // Without this, Paddle may still have the downgrade target (e.g. Pro) as the current price after we clear scheduled_change.
  if (isPaidPlan(currentCode)) {
    const updateResult = await updateSubscriptionPrice({
      providerSubscriptionId: subscription.providerSubscriptionId,
      targetPlanCode: currentCode,
      effective: "next_period",
      clearScheduledCancel: false,
      tenantId,
    });
    if (!updateResult.ok) {
      return ApiErrors.VALIDATION_ERROR(
        updateResult.error ?? "Failed to update subscription to current plan. Try again or contact support."
      );
    }
  }

  const currentPlan = await prisma.plan.findFirst({
    where: { code: { equals: currentCode, mode: "insensitive" }, isActive: true },
    select: { id: true },
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      ...(currentPlan ? { planId: currentPlan.id } : {}),
      cancelAtPeriodEnd: false,
      pendingPlanCode: null,
      pendingChangeType: null,
      pendingEffectiveAt: null,
      entitlementEffectiveUntil: null,
      downgradePaddleAppliedAt: null,
      billingPlanCode: currentCode,
      currentEntitlementPlanCode: currentCode,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.scheduled_change_cleared",
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: {
      previousPendingPlanCode: subscription.pendingPlanCode,
      previousCancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      keptPlanCode: currentCode,
    },
  });

  return apiSuccess({ cleared: true, planCode: currentCode });
});
