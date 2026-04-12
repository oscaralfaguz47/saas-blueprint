import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { updateSubscriptionPrice } from "@/server/billing/paddle/subscriptions/update-subscription-price";
import { clearScheduledChangeOnly } from "@/server/billing/paddle/subscriptions/clear-scheduled-change";
import { cancelSubscriptionAtPeriodEnd } from "@/server/billing/paddle/subscriptions/cancel-subscription-at-period-end";
import { createCheckoutSession } from "@/server/billing/providers/paddle/create-checkout-session";
import { writeAuditLog } from "@/server/services/audit";
import { logCheckoutInitiated } from "@/server/billing/billing-log";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { type PlanCode, isUpgrade, isDowngrade } from "@/lib/billing/plan-catalog";
import { z } from "zod";

const changePlanBodySchema = z.object({
  targetPlanCode: z.enum(["free", "starter", "pro", "scale"]),
  effective: z.enum(["immediate", "next_period"]).optional().default("next_period"),
  billingInterval: z.enum(["monthly", "annual"]).optional().default("monthly"),
});

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
  const billingInterval = body.billingInterval ?? "monthly";

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      providerSubscriptionId: true,
      cancelAtPeriodEnd: true,
      pendingPlanCode: true,
      planId: true,
      currentPeriodEnd: true,
      currentEntitlementPlanCode: true,
      billingInterval: true,
      plan: { select: { code: true } },
    },
  });

  // Use entitlement plan (what user has access to now); after reconcile planId may be billing plan (lower).
  const currentCode = (
    subscription?.currentEntitlementPlanCode ??
    subscription?.plan?.code ??
    "free"
  ).toLowerCase();
  const currentCodeForCatalog: PlanCode =
    currentCode === "enterprise" ? "scale" : (currentCode as PlanCode);

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
      const periodEnd = subscription.currentPeriodEnd ?? undefined;
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          pendingPlanCode: "free",
          pendingChangeType: "cancel_to_free_end_of_period",
          pendingEffectiveAt: periodEnd,
          entitlementEffectiveUntil: periodEnd,
          currentEntitlementPlanCode: currentCode,
          billingPlanCode: currentCode,
        },
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
    const periodEnd = subscription.currentPeriodEnd ?? undefined;
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        pendingPlanCode: "free",
        pendingChangeType: "cancel_to_free_end_of_period",
        pendingEffectiveAt: periodEnd,
        entitlementEffectiveUntil: periodEnd,
        currentEntitlementPlanCode: currentCode,
        billingPlanCode: currentCode,
      },
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
        planCode: targetCode as "starter" | "pro" | "scale",
        customerEmail,
        customerName: session.user.name ?? null,
        billingInterval,
      });
      logCheckoutInitiated({ tenantId, planCode: targetCode });
      await writeAuditLog({
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.billing.checkout_initiated",
        targetType: "Subscription",
        metadata: { planCode: targetCode, billingInterval },
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
      if (message.includes("Annual billing is not yet configured")) {
        return ApiErrors.VALIDATION_ERROR(message);
      }
      throw err;
    }
  }

  if (
    !isUpgrade(currentCodeForCatalog, targetCode) &&
    !isDowngrade(currentCodeForCatalog, targetCode)
  ) {
    return apiSuccess({ mode: "update_subscription" as const, effective: "next_period" as const });
  }

  const isUpgradeFlow = isUpgrade(currentCodeForCatalog, targetCode);
  const isResumeFromCancellation =
    subscription.cancelAtPeriodEnd && subscription.pendingPlanCode === "free";
  const clearScheduledCancel =
    subscription.cancelAtPeriodEnd && (isUpgradeFlow || isResumeFromCancellation);

  // Upgrade: charge prorated now, same cycle; entitlements update only after webhook (no optimistic DB update).
  const effectiveTiming: "immediate" | "next_period" = isUpgradeFlow ? "immediate" : "next_period";

  if (effectiveTiming === "next_period") {
    if (isResumeFromCancellation) {
      // "Schedule instead" to a smaller plan = downgrade: keep current plan until period end.
      // "Resume" to same/larger plan = cancel the cancellation and use chosen plan immediately.
      const scheduleInsteadDowngrade = isDowngrade(currentCodeForCatalog, targetCode);

      // Two-step flow: Paddle forbids combining scheduled_change with items/proration in one PATCH.
      // Step 1: Clear only scheduled_change (no items, no proration).
      const clearResult = await clearScheduledChangeOnly(subscription.providerSubscriptionId);
      if (!clearResult.ok) {
        return ApiErrors.VALIDATION_ERROR(
          clearResult.error ?? "Failed to clear scheduled cancellation. Try again or contact support."
        );
      }
      // Step 2: Apply chosen plan in Paddle with do_not_bill (no proration/credits); next payment = new plan price.
      const updateResult = await updateSubscriptionPrice({
        providerSubscriptionId: subscription.providerSubscriptionId,
        targetPlanCode: targetCode as "starter" | "pro" | "scale",
        billingInterval,
        effective: "next_period",
        clearScheduledCancel: false,
        tenantId,
        currentBillingInterval: subscription.billingInterval === "annual" ? "annual" : "monthly",
      });
      if (!updateResult.ok) {
        return ApiErrors.VALIDATION_ERROR(
          updateResult.error ?? "Failed to resume subscription. Try again or contact support."
        );
      }
      const periodEnd = subscription.currentPeriodEnd ?? undefined;
      if (scheduleInsteadDowngrade) {
        // Keep current (larger) plan until period end; schedule downgrade to target at period end.
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            cancelAtPeriodEnd: false,
            pendingPlanCode: targetCode,
            downgradePaddleAppliedAt: new Date(),
            billingPlanCode: targetCode,
            currentEntitlementPlanCode: currentCode,
            pendingChangeType: "downgrade_end_of_period",
            pendingEffectiveAt: periodEnd,
            entitlementEffectiveUntil: periodEnd,
            billingInterval,
          },
        });
      } else {
        // Resume to same or larger plan: use chosen plan immediately.
        const newPlan = await prisma.plan.findFirst({
          where: { code: { equals: targetCode, mode: "insensitive" }, isActive: true },
          select: { id: true },
        });
        if (newPlan) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              planId: newPlan.id,
              cancelAtPeriodEnd: false,
              pendingPlanCode: null,
              billingPlanCode: targetCode,
              currentEntitlementPlanCode: targetCode,
              pendingChangeType: null,
              pendingEffectiveAt: null,
              entitlementEffectiveUntil: null,
              billingInterval,
            },
          });
        }
      }
    } else {
      // Paid→paid downgrade: DB-only at click time. Paddle is updated at period end by period-close.
      // Do not call updateSubscriptionPrice here — that would switch the Paddle item to the new monthly
      // price immediately and move next_billed_at to the next month instead of the annual period end.
      const periodEnd = subscription.currentPeriodEnd ?? undefined;
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          pendingPlanCode: targetCode,
          pendingBillingInterval: billingInterval,
          billingPlanCode: targetCode,
          currentEntitlementPlanCode: currentCode,
          pendingChangeType: "downgrade_end_of_period",
          pendingEffectiveAt: periodEnd,
          entitlementEffectiveUntil: periodEnd,
          ...(clearScheduledCancel ? { cancelAtPeriodEnd: false } : {}),
        },
      });
    }
  } else {
    // Upgrade: Paddle forbids combining scheduled_change with items/proration in one PATCH.
    // If we need to clear a scheduled cancellation, do it in a separate request first.
    if (clearScheduledCancel) {
      const clearResult = await clearScheduledChangeOnly(subscription.providerSubscriptionId);
      if (!clearResult.ok) {
        return ApiErrors.VALIDATION_ERROR(
          clearResult.error ?? "Failed to clear scheduled cancellation. Try again or contact support."
        );
      }
    }
    const updateResult = await updateSubscriptionPrice({
      providerSubscriptionId: subscription.providerSubscriptionId,
      targetPlanCode: targetCode as "starter" | "pro" | "scale",
      billingInterval,
      effective: "immediate",
      clearScheduledCancel: false,
      tenantId,
    });
    if (!updateResult.ok) {
      const err = updateResult.error ?? "Failed to update subscription. Try again or contact support.";
      const isPaymentDeclined =
        typeof err === "string" &&
        (err.toLowerCase().includes("subscription_payment_declined") || err.toLowerCase().includes("payment declined"));
      if (isPaymentDeclined) {
        return ApiErrors.VALIDATION_ERROR(
          "Your card was declined. Please update your payment method to continue.",
          { code: "PAYMENT_DECLINED" }
        );
      }
      return ApiErrors.VALIDATION_ERROR(err);
    }
    // After successful immediate upgrade, persist billingInterval so UI is consistent before the webhook arrives
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        billingInterval,
        billingPlanCode: targetCode,
      },
    });
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
      billingInterval,
    },
  });

  return apiSuccess({
    mode: "update_subscription" as const,
    effective: effectiveTiming,
  });
});
