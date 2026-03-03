import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { fetchPaddleSubscription, resolvePlanFromPaddleSubscription, mapPaddleStatusToInternal } from "@/server/billing/providers/paddle/fetch-subscription";
import { getGraceUntilForPastDue, isCancelAtPeriodEnd } from "@/server/billing/providers/paddle/map-paddle-event";
import { updateSubscriptionPrice } from "@/server/billing/paddle/subscriptions/update-subscription-price";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * Reconcile subscription state from Paddle (fallback when webhook is delayed).
 * Auth + tenant.billing.manage. Rate-limit should be applied (e.g. 1/min per tenant).
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

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: {
      id: true,
      providerSubscriptionId: true,
      tenantId: true,
    },
  });

  if (!sub?.providerSubscriptionId) {
    return apiSuccess({ ok: false, noSubscription: true });
  }

  let paddleSub = await fetchPaddleSubscription(sub.providerSubscriptionId);
  if (!paddleSub) {
    return apiSuccess({ ok: false, notFoundAtProvider: true });
  }

  let resolved = resolvePlanFromPaddleSubscription(paddleSub, sub.tenantId);
  if (!resolved || resolved.tenantId !== tenantId) {
    return ApiErrors.FORBIDDEN();
  }

  if (paddleSub.items && paddleSub.items.length > 1) {
    const normalizeResult = await updateSubscriptionPrice({
      providerSubscriptionId: sub.providerSubscriptionId,
      targetPlanCode: resolved.planCode,
      effective: "next_period",
      tenantId: sub.tenantId,
    });
    if (!normalizeResult.ok) {
      return apiSuccess({ ok: false, normalized: false, error: normalizeResult.error });
    }
    paddleSub = await fetchPaddleSubscription(sub.providerSubscriptionId) ?? paddleSub;
    resolved = resolvePlanFromPaddleSubscription(paddleSub, sub.tenantId) ?? resolved;
  }

  const plan = await prisma.plan.findUnique({
    where: { code: resolved.planCode, isActive: true },
    select: { id: true },
  });
  if (!plan) return ApiErrors.VALIDATION_ERROR("Plan not found.");

  const status = mapPaddleStatusToInternal(paddleSub.status);
  const period = paddleSub.current_billing_period;
  const currentPeriodStart = period?.starts_at ? new Date(period.starts_at) : null;
  const currentPeriodEnd = period?.ends_at ? new Date(period.ends_at) : null;
  const cancelAtPeriodEnd = isCancelAtPeriodEnd(paddleSub.scheduled_change);
  const graceUntil = status === "PAST_DUE" ? getGraceUntilForPastDue() : null;

  // Sync from Paddle only fields Paddle is source of truth for. Do not clear pending downgrade
  // state (pendingPlanCode, pendingChangeType, etc.) so the "Downgrade scheduled" banner is
  // preserved when user updates payment method (reconcile is called after checkout.completed).
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      planId: plan.id,
      providerCustomerId: paddleSub.customer_id,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      graceUntil,
      cancelAtPeriodEnd,
    },
  });

  return apiSuccess({ ok: true });
});
