import "server-only";

import { prisma } from "@/server/db";
import type { SubscriptionStatus } from "@prisma/client";

const BLOCKED_STATUSES: SubscriptionStatus[] = ["SUSPENDED", "CANCELED"];

export type EffectiveSubscription = {
  subscriptionId: string;
  tenantId: string;
  planId: string;
  planCode: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanCode: string | null;
  /** none | downgrade_end_of_period | cancel_to_free_end_of_period */
  pendingChangeType: string | null;
  entitlementEffectiveUntil: Date | null;
  paymentStatus: string | null;
  graceEndsAt: Date | null;
  pastDueSince: Date | null;
  /** If true, operations should be blocked (UPGRADE_REQUIRED). */
  isBlocked: boolean;
};

/**
 * Resolve the effective subscription for a tenant. Used for gating and plan resolution.
 * Entitlements use currentEntitlementPlanCode when set (for downgrade: keep higher until period end).
 * If status is SUSPENDED or CANCELED and graceUntil has expired, isBlocked = true.
 * If paymentStatus is past_due and now > graceEndsAt, isBlocked = true (restrict access until payment recovered).
 * PAST_DUE within grace: allow operations.
 */
export async function resolveEffectiveSubscription(
  tenantId: string
): Promise<EffectiveSubscription | null> {
  const sub = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      tenantId: true,
      planId: true,
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      graceUntil: true,
      cancelAtPeriodEnd: true,
      pendingPlanCode: true,
      currentEntitlementPlanCode: true,
      entitlementEffectiveUntil: true,
      pendingChangeType: true,
      paymentStatus: true,
      graceEndsAt: true,
      pastDueSince: true,
      plan: { select: { code: true } },
    },
  });

  if (!sub) return null;

  const now = new Date();
  const graceExpired = sub.graceUntil ? sub.graceUntil < now : true;
  const paymentGraceExpired =
    sub.paymentStatus === "past_due" &&
    sub.graceEndsAt != null &&
    now > sub.graceEndsAt;
  const isBlocked =
    (BLOCKED_STATUSES.includes(sub.status) && graceExpired) || paymentGraceExpired;

  /** Entitlement plan: use explicit field when set; else plan.code. When payment grace expired, restrict to free until recovered. */
  const entitlementCode = paymentGraceExpired
    ? "free"
    : (sub.currentEntitlementPlanCode ?? sub.plan.code);
  const planId = sub.planId;

  return {
    subscriptionId: sub.id,
    tenantId: sub.tenantId,
    planId,
    planCode: entitlementCode,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    graceUntil: sub.graceUntil,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pendingPlanCode: sub.pendingPlanCode,
    pendingChangeType: sub.pendingChangeType ?? null,
    entitlementEffectiveUntil: sub.entitlementEffectiveUntil ?? null,
    paymentStatus: sub.paymentStatus ?? null,
    graceEndsAt: sub.graceEndsAt ?? null,
    pastDueSince: sub.pastDueSince ?? null,
    isBlocked,
  };
}
