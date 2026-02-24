import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { fetchPaddleSubscription, resolvePlanFromPaddleSubscription, mapPaddleStatusToInternal } from "@/server/billing/providers/paddle/fetch-subscription";
import { getGraceUntilForPastDue, isCancelAtPeriodEnd } from "@/server/billing/providers/paddle/map-paddle-event";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * Reconcile subscription state from Paddle (fallback when webhook is delayed).
 * Auth + tenant.billing.manage. Rate-limit should be applied (e.g. 1/min per tenant).
 */
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

  const paddleSub = await fetchPaddleSubscription(sub.providerSubscriptionId);
  if (!paddleSub) {
    return apiSuccess({ ok: false, notFoundAtProvider: true });
  }

  const resolved = resolvePlanFromPaddleSubscription(paddleSub, sub.tenantId);
  if (!resolved || resolved.tenantId !== tenantId) {
    return ApiErrors.FORBIDDEN();
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
