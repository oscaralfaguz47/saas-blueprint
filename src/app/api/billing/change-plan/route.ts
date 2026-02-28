import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { updateSubscriptionPrice } from "@/server/billing/paddle/subscriptions/update-subscription-price";
import { cancelSubscriptionAtPeriodEnd } from "@/server/billing/paddle/subscriptions/cancel-subscription-at-period-end";
import { createCheckoutSession } from "@/server/billing/providers/paddle/create-checkout-session";
import { writeAuditLog } from "@/server/services/audit";
import { logCheckoutInitiated } from "@/server/billing/billing-log";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { z } from "zod";

const changePlanBodySchema = z.object({
  targetPlanCode: z.enum(["free", "starter", "pro", "enterprise"]),
  effective: z.enum(["immediate", "next_period"]).optional().default("next_period"),
});

const PLAN_ORDER = ["free", "starter", "pro", "enterprise"] as const;
type PlanCode = (typeof PLAN_ORDER)[number];

function planOrderIndex(code: string): number {
  const i = PLAN_ORDER.indexOf(code as PlanCode);
  return i >= 0 ? i : -1;
}
function isUpgrade(currentCode: string, targetCode: string): boolean {
  return planOrderIndex(targetCode) > planOrderIndex(currentCode);
}
function isDowngrade(currentCode: string, targetCode: string): boolean {
  return planOrderIndex(targetCode) < planOrderIndex(currentCode);
}

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

  const body = await parseBody(req, changePlanBodySchema);
  const targetCode = body.targetPlanCode;
  const effective = body.effective ?? "next_period";

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      providerSubscriptionId: true,
      cancelAtPeriodEnd: true,
      pendingPlanCode: true,
      planId: true,
      plan: { select: { code: true } },
    },
  });

  const currentCode = (subscription?.plan?.code ?? "free").toLowerCase();

  if (targetCode === "free") {
    if (!subscription) {
      return apiSuccess({ mode: "noop_free" as const });
    }
    if (effective !== "next_period") {
      return ApiErrors.VALIDATION_ERROR(
        "Downgrade to Free takes effect at the end of your billing period. Use effective: 'next_period'."
      );
    }
    if (subscription.cancelAtPeriodEnd && subscription.pendingPlanCode === "free") {
      return apiSuccess({ mode: "cancel_at_period_end" as const });
    }
    if (!subscription.providerSubscriptionId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true, pendingPlanCode: "free" },
      });
      await writeAuditLog({
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.billing.cancellation_scheduled",
        targetType: "Subscription",
        targetId: subscription.id,
        metadata: { pendingPlanCode: "free", previousPlanCode: currentCode },
      });
      return apiSuccess({ mode: "cancel_at_period_end" as const });
    }
    const cancelResult = await cancelSubscriptionAtPeriodEnd(subscription.providerSubscriptionId);
    if (!cancelResult.ok) {
      return ApiErrors.VALIDATION_ERROR(
        cancelResult.error ?? "Failed to schedule cancellation. Try again or contact support."
      );
    }
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, pendingPlanCode: "free" },
    });
    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId,
      action: "tenant.billing.cancellation_scheduled",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { pendingPlanCode: "free", previousPlanCode: currentCode },
    });
    return apiSuccess({ mode: "cancel_at_period_end" as const });
  }

  if (!subscription?.providerSubscriptionId) {
    const customerEmail = session.user.email?.trim();
    if (!customerEmail) {
      return ApiErrors.VALIDATION_ERROR("User email is required for checkout.");
    }
    try {
      const result = await createCheckoutSession({
        tenantId,
        planCode: targetCode as "starter" | "pro" | "enterprise",
        customerEmail,
        customerName: session.user.name ?? null,
      });
      logCheckoutInitiated({ tenantId, planCode: targetCode });
      await writeAuditLog({
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.billing.checkout_initiated",
        targetType: "Subscription",
        metadata: { planCode: targetCode },
      });
      return apiSuccess({
        mode: "checkout" as const,
        transactionId: result.transactionId,
        environment: result.environment,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Cannot checkout free plan")) {
        return ApiErrors.VALIDATION_ERROR("Free plan cannot be checked out.");
      }
      throw err;
    }
  }

  if (!isUpgrade(currentCode, targetCode) && !isDowngrade(currentCode, targetCode)) {
    return apiSuccess({ mode: "update_subscription" as const, effective: "next_period" as const });
  }

  const isUpgradeFlow = isUpgrade(currentCode, targetCode);
  const clearScheduledCancel =
    subscription.cancelAtPeriodEnd && isUpgradeFlow;

  // Upgrade: charge prorated now, same cycle; entitlements update only after webhook (no optimistic DB update).
  const effectiveTiming: "immediate" | "next_period" = isUpgradeFlow ? "immediate" : "next_period";

  if (effectiveTiming === "next_period") {
    // Downgrade: do NOT call Paddle here. Paddle would apply the new price immediately; we need the change
    // to take effect only at next billing date. We persist scheduled downgrade state only; a periodic job
    // (period-close) will call Paddle when currentPeriodEnd has passed, then the webhook applies the plan.
    // UI shows current plan until webhook confirms; banner shows "Downgrade scheduled for <date>".
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        pendingPlanCode: targetCode,
        ...(clearScheduledCancel ? { cancelAtPeriodEnd: false } : {}),
      },
    });
  } else {
    const updateResult = await updateSubscriptionPrice({
      providerSubscriptionId: subscription.providerSubscriptionId,
      targetPlanCode: targetCode as "starter" | "pro" | "enterprise",
      effective: "immediate",
      clearScheduledCancel,
      tenantId,
    });
    if (!updateResult.ok) {
      return ApiErrors.VALIDATION_ERROR(
        updateResult.error ?? "Failed to update subscription. Try again or contact support."
      );
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.plan_change_requested",
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: {
      targetPlanCode: targetCode,
      previousPlanCode: currentCode,
      effective: effectiveTiming,
    },
  });

  return apiSuccess({
    mode: "update_subscription" as const,
    effective: effectiveTiming,
  });
});
