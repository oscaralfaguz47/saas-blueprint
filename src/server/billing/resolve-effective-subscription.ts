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
  /** If true, operations should be blocked (UPGRADE_REQUIRED). */
  isBlocked: boolean;
};

/**
 * Resolve the effective subscription for a tenant. Used for gating and plan resolution.
 * If status is SUSPENDED or CANCELED and graceUntil has expired, isBlocked = true.
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
      plan: { select: { code: true } },
    },
  });

  if (!sub) return null;

  const now = new Date();
  const graceExpired = sub.graceUntil ? sub.graceUntil < now : true;
  const isBlocked =
    BLOCKED_STATUSES.includes(sub.status) && graceExpired;

  return {
    subscriptionId: sub.id,
    tenantId: sub.tenantId,
    planId: sub.planId,
    planCode: sub.plan.code,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    graceUntil: sub.graceUntil,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pendingPlanCode: sub.pendingPlanCode,
    isBlocked,
  };
}
