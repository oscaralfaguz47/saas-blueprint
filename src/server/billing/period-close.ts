import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  getPeriodStartForDate,
  getPeriodEndForDate,
} from "./get-or-create-billing-state";
import { resolveTenantPlan } from "./resolve-tenant-plan";
import { resolveEffectiveSubscription } from "./resolve-effective-subscription";
import { writeAuditLog } from "@/server/services/audit";
import { fetchPaddleSubscription } from "@/server/billing/providers/paddle/fetch-subscription";
import { updateSubscriptionPrice } from "@/server/billing/paddle/subscriptions/update-subscription-price";

const ROLLOVER_EXPIRY_DAYS = 60;

type ScheduledDowngradeSubscriptionRow = Prisma.SubscriptionGetPayload<{
  select: {
    id: true;
    tenantId: true;
    providerSubscriptionId: true;
    pendingPlanCode: true;
    pendingBillingInterval: true;
    downgradePaddleAppliedAt: true;
    billingInterval: true;
  };
}>;

/**
 * EPIC 5: Close billing periods that have ended; create TenantRolloverLot (60d expiry); apply pendingPlanCode (downgrade to free).
 * Scheduled paid downgrades: we do NOT call Paddle when the user clicks Downgrade (so Paddle keeps the higher plan).
 * When the subscription period is within 24 hours of ending (or already ended), we call Paddle to update to the lower
 * price so renewal charges the new price. Paddle then sends subscription.updated and our webhook updates our DB.
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

    const isAnnual = resolved.billingInterval === "annual";
    const nextPeriodStart = new Date(periodStart);
    let nextPeriodEnd: Date;
    if (isAnnual) {
      nextPeriodStart.setUTCFullYear(nextPeriodStart.getUTCFullYear() + 1);
      nextPeriodEnd = new Date(periodEnd);
      nextPeriodEnd.setUTCFullYear(nextPeriodEnd.getUTCFullYear() + 1);
    } else {
      nextPeriodStart.setUTCMonth(nextPeriodStart.getUTCMonth() + 1);
      nextPeriodEnd = getPeriodEndForDate(nextPeriodStart);
    }

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
 * Apply scheduled paid downgrades when pendingPlanCode is set:
 * (1) Legacy: Paddle was updated at click (downgradePaddleAppliedAt set) — sync DB once currentPeriodEnd has passed.
 * (2) Default: DB-only at click — PATCH Paddle within 24h before currentPeriodEnd (or catch-up if already passed)
 *     so renewal uses the lower price; webhook then syncs DB.
 */
async function applyScheduledPaidDowngrades(now: Date): Promise<void> {
  const BATCH_SIZE = 50;
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const where = {
      provider: "paddle" as const,
      pendingPlanCode: { not: null },
      OR: [
        {
          downgradePaddleAppliedAt: { not: null },
          currentPeriodEnd: { not: null, lt: now },
        },
        {
          downgradePaddleAppliedAt: null,
          pendingChangeType: "downgrade_end_of_period" as const,
          currentPeriodEnd: { not: null, lt: oneDayFromNow },
        },
      ],
    };
    const select = {
      id: true,
      tenantId: true,
      providerSubscriptionId: true,
      pendingPlanCode: true,
      pendingBillingInterval: true,
      downgradePaddleAppliedAt: true,
      billingInterval: true,
    };
    const subs: ScheduledDowngradeSubscriptionRow[] = cursor
      ? await prisma.subscription.findMany({
          where,
          select,
          take: BATCH_SIZE,
          skip: 1,
          cursor: { id: cursor },
          orderBy: { id: "asc" },
        })
      : await prisma.subscription.findMany({
          where,
          select,
          take: BATCH_SIZE,
          orderBy: { id: "asc" },
        });

    hasMore = subs.length === BATCH_SIZE;
    if (subs.length > 0) {
      cursor = subs[subs.length - 1]?.id;
    }

    for (const sub of subs) {
      const code = sub.pendingPlanCode?.toLowerCase();
      if (!code || code === "free") continue;
      if (
        code !== "starter" &&
        code !== "pro" &&
        code !== "scale" &&
        code !== "enterprise"
      ) {
        continue;
      }

      if (sub.downgradePaddleAppliedAt != null) {
        // Legacy: Paddle was already updated at click time; only sync our DB and clear pending fields.
        const plan = await prisma.plan.findFirst({
          where: { code: { equals: code, mode: "insensitive" }, isActive: true },
          select: { id: true },
        });
        if (plan) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              planId: plan.id,
              pendingPlanCode: null,
              pendingBillingInterval: null,
              downgradePaddleAppliedAt: null,
              pendingChangeType: null,
              pendingEffectiveAt: null,
              entitlementEffectiveUntil: null,
              billingPlanCode: code,
              currentEntitlementPlanCode: code,
            },
          });
        }
        continue;
      }

      if (!sub.providerSubscriptionId) continue;
      const paddleTarget: "starter" | "pro" | "scale" =
        code === "enterprise" ? "scale" : (code as "starter" | "pro" | "scale");
      const targetBillingInterval: "monthly" | "annual" =
        sub.pendingBillingInterval === "annual" || sub.pendingBillingInterval === "monthly"
          ? sub.pendingBillingInterval
          : sub.billingInterval === "annual"
            ? "annual"
            : "monthly";
      const result = await updateSubscriptionPrice({
        providerSubscriptionId: sub.providerSubscriptionId,
        targetPlanCode: paddleTarget,
        billingInterval: targetBillingInterval,
        effective: "next_period",
        tenantId: sub.tenantId,
        currentBillingInterval: sub.billingInterval === "annual" ? "annual" : "monthly",
      });
      if (!result.ok) {
        console.error("[applyScheduledPaidDowngrades]", sub.id, result.error);
        continue;
      }
      const plan = await prisma.plan.findFirst({
        where: { code: { equals: code, mode: "insensitive" }, isActive: true },
        select: { id: true },
      });
      if (!plan) {
        console.error("[applyScheduledPaidDowngrades] plan not found", code);
        continue;
      }
      // Webhook payloads sometimes omit current_billing_period; sync anchor from Paddle immediately
      // so DB matches billing_cycle (e.g. monthly → annual after prorated_immediately).
      let periodStart: Date | undefined;
      let periodEnd: Date | undefined;
      const paddleAfter = await fetchPaddleSubscription(sub.providerSubscriptionId);
      const p = paddleAfter?.current_billing_period;
      if (p?.starts_at && p?.ends_at) {
        periodStart = new Date(p.starts_at);
        periodEnd = new Date(p.ends_at);
      }
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          planId: plan.id,
          pendingPlanCode: null,
          pendingBillingInterval: null,
          pendingChangeType: null,
          pendingEffectiveAt: null,
          entitlementEffectiveUntil: null,
          billingPlanCode: code,
          currentEntitlementPlanCode: code,
          billingInterval: targetBillingInterval,
          downgradePaddleAppliedAt: new Date(),
          ...(periodStart && periodEnd
            ? { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }
            : {}),
        },
      });
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
      status: "CANCELED",
      cancelAtPeriodEnd: false,
      pendingPlanCode: null,
      pendingChangeType: null,
      pendingEffectiveAt: null,
      entitlementEffectiveUntil: null,
      billingPlanCode: "free",
      currentEntitlementPlanCode: "free",
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
