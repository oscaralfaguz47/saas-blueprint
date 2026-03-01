import "server-only";

import { prisma } from "@/server/db";
import {
  getPeriodStartForDate,
  getPeriodEndForDate,
} from "./get-or-create-billing-state";
import { resolveTenantPlan } from "./resolve-tenant-plan";
import { resolveEffectiveSubscription } from "./resolve-effective-subscription";
import { writeAuditLog } from "@/server/services/audit";
import { updateSubscriptionPrice } from "@/server/billing/paddle/subscriptions/update-subscription-price";

const ROLLOVER_EXPIRY_DAYS = 60;

/**
 * EPIC 5: Close billing periods that have ended; create TenantRolloverLot (60d expiry); apply pendingPlanCode (downgrade to free).
 * Scheduled paid downgrades: we do NOT call Paddle when the user clicks Downgrade (so Paddle keeps the higher plan).
 * When currentPeriodEnd has passed, we call Paddle here to update the subscription to the lower price; Paddle then
 * sends subscription.updated and our webhook updates our DB. So the plan in Paddle and our app change only at renewal.
 * Idempotent and batch-safe. Optionally pass actorUserId for audit (cron uses system actor if configured).
 */
export async function runPeriodClose(params?: {
  actorUserId?: string | null;
}): Promise<{ closed: number }> {
  const now = new Date();

  await applyScheduledPaidDowngrades(now);

  const openStatesToClose = await prisma.tenantBillingState.findMany({
    where: {
      status: "OPEN",
      periodEnd: { lt: now },
    },
    select: {
      tenantId: true,
      periodStart: true,
      periodEnd: true,
      planCode: true,
      rolloverRequests: true,
    },
  });

  let closed = 0;
  for (const state of openStatesToClose) {
    const { tenantId, periodStart, periodEnd, planCode, rolloverRequests } =
      state;
    const resolved = await resolveTenantPlan(tenantId);
    const features = resolved.features;
    const req = features.requests;

    if (req.rolloverMonths === 0 || req.hardCap) {
      await prisma.tenantBillingState.update({
        where: { tenantId_periodStart: { tenantId, periodStart } },
        data: { status: "CLOSED" },
      });
      await applyPendingPlanCodeIfNeeded(tenantId, periodEnd, params?.actorUserId);
      if (params?.actorUserId) {
        await writeAuditLog({
          actorUserId: params.actorUserId,
          actorContext: "TENANT",
          tenantId,
          action: "tenant.billing.period_closed",
          targetType: "TenantBillingState",
          targetId: `${tenantId}:${periodStart.toISOString()}`,
          metadata: { periodStart: periodStart.toISOString(), planCode },
        });
      }
      closed++;
      continue;
    }

    const counter = await prisma.tenantUsageCounter.findUnique({
      where: {
        tenantId_periodStart_meter: {
          tenantId,
          periodStart,
          meter: "REQUESTS",
        },
      },
      select: { usedCount: true },
    });
    const used = counter?.usedCount ?? 0;
    const unused = Math.max(0, req.included + rolloverRequests - used);
    const rolloverToNext = Math.min(unused, req.maxAvailable);

    const expiresAt = new Date(periodEnd);
    expiresAt.setDate(expiresAt.getDate() + ROLLOVER_EXPIRY_DAYS);

    const nextPeriodStart = new Date(periodStart);
    nextPeriodStart.setUTCMonth(nextPeriodStart.getUTCMonth() + 1);
    const nextPeriodEnd = getPeriodEndForDate(nextPeriodStart);

    await prisma.$transaction([
      prisma.tenantBillingState.update({
        where: { tenantId_periodStart: { tenantId, periodStart } },
        data: { status: "CLOSED" },
      }),
      ...(rolloverToNext > 0
        ? [
            prisma.tenantRolloverLot.create({
              data: {
                tenantId,
                periodStart,
                granted: rolloverToNext,
                used: 0,
                expiresAt,
              },
            }),
          ]
        : []),
      prisma.tenantBillingState.upsert({
        where: {
          tenantId_periodStart: { tenantId, periodStart: nextPeriodStart },
        },
        create: {
          tenantId,
          periodStart: nextPeriodStart,
          periodEnd: nextPeriodEnd,
          status: "OPEN",
          rolloverRequests: rolloverToNext,
          planCode,
        },
        update: {
          rolloverRequests: rolloverToNext,
        },
      }),
    ]);

    await applyPendingPlanCodeIfNeeded(tenantId, periodEnd, params?.actorUserId);
    if (params?.actorUserId) {
      await writeAuditLog({
        actorUserId: params.actorUserId,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.billing.period_closed",
        targetType: "TenantBillingState",
        targetId: `${tenantId}:${periodStart.toISOString()}`,
        metadata: {
          periodStart: periodStart.toISOString(),
          planCode,
          rolloverToNext,
        },
      });
    }
    closed++;
  }

  return { closed };
}

/**
 * Apply scheduled paid downgrades: when the subscription's current period has ended and pendingPlanCode is set,
 * either (1) only update our DB when we already applied the downgrade in Paddle at click time
 * (downgradePaddleAppliedAt set), or (2) call Paddle with do_not_bill so webhook updates planId (legacy).
 */
async function applyScheduledPaidDowngrades(now: Date): Promise<void> {
  const subs = await prisma.subscription.findMany({
    where: {
      provider: "paddle",
      pendingPlanCode: { not: null },
      currentPeriodEnd: { not: null, lt: now },
    },
    select: {
      id: true,
      tenantId: true,
      providerSubscriptionId: true,
      pendingPlanCode: true,
      downgradePaddleAppliedAt: true,
    },
  });
  for (const sub of subs) {
    const code = sub.pendingPlanCode?.toLowerCase();
    if (!code || code === "free") continue;
    if (code !== "starter" && code !== "pro" && code !== "enterprise") continue;

    if (sub.downgradePaddleAppliedAt != null) {
      // We already updated Paddle at downgrade click with prorated_next_billing_period; only sync our DB.
      const plan = await prisma.plan.findFirst({
        where: { code: { equals: code, mode: "insensitive" }, isActive: true },
        select: { id: true },
      });
      if (plan) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { planId: plan.id, pendingPlanCode: null, downgradePaddleAppliedAt: null },
        });
      }
      continue;
    }

    if (!sub.providerSubscriptionId) continue;
    const result = await updateSubscriptionPrice({
      providerSubscriptionId: sub.providerSubscriptionId,
      targetPlanCode: code as "starter" | "pro" | "enterprise",
      effective: "next_period",
      tenantId: sub.tenantId,
    });
    if (!result.ok) {
      console.error("[applyScheduledPaidDowngrades]", sub.id, result.error);
    }
  }
}

/** EPIC 5: When period ended, apply downgrade to free (clear cancelAtPeriodEnd, set plan to free). */
async function applyPendingPlanCodeIfNeeded(
  tenantId: string,
  periodEnd: Date,
  actorUserId?: string | null
): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      cancelAtPeriodEnd: true,
      pendingPlanCode: true,
      currentPeriodEnd: true,
    },
  });
  if (
    !sub ||
    !sub.cancelAtPeriodEnd ||
    sub.pendingPlanCode?.toLowerCase() !== "free" ||
    !sub.currentPeriodEnd ||
    sub.currentPeriodEnd > periodEnd
  ) {
    return;
  }

  const freePlan = await prisma.plan.findUnique({
    where: { code: "free", isActive: true },
    select: { id: true },
  });
  if (!freePlan) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      planId: freePlan.id,
      cancelAtPeriodEnd: false,
      pendingPlanCode: null,
    },
  });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId: actorUserId,
      actorContext: "TENANT",
      tenantId,
      action: "tenant.billing.plan_changed",
      targetType: "Subscription",
      targetId: sub.id,
      metadata: { appliedPendingPlanCode: "free" },
    });
  }
}
