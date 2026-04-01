import "server-only";

import { prisma } from "@/server/db";
import type { TenantBillingState } from "@prisma/client";
import { resolveTenantPlan } from "./resolve-tenant-plan";
import {
  resolveEffectiveSubscription,
  type EffectiveSubscription,
} from "./resolve-effective-subscription";

/** Start of calendar month UTC (00:00:00.000). */
export function getPeriodStartForDate(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
}

/** End of calendar month UTC (last ms of last day). */
export function getPeriodEndForDate(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
}

/**
 * EPIC 5: Billing period for tenant. Paid = subscription currentPeriodStart/End; Free = calendar month UTC.
 */
export async function getBillingPeriodForTenant(
  tenantId: string,
  atDate: Date = new Date(),
  preResolvedEffective?: EffectiveSubscription | null
): Promise<{ periodStart: Date; periodEnd: Date }> {
  const effective =
    preResolvedEffective !== undefined
      ? preResolvedEffective
      : await resolveEffectiveSubscription(tenantId);
  if (
    effective?.currentPeriodStart &&
    effective?.currentPeriodEnd &&
    effective.planCode?.toLowerCase() !== "free"
  ) {
    const start = new Date(effective.currentPeriodStart);
    const end = new Date(effective.currentPeriodEnd);
    if (atDate >= start && atDate <= end) {
      return { periodStart: start, periodEnd: end };
    }
  }
  const periodStart = getPeriodStartForDate(atDate);
  const periodEnd = getPeriodEndForDate(atDate);
  return { periodStart, periodEnd };
}

export async function getOrCreateBillingState(
  tenantId: string,
  atDate: Date = new Date()
): Promise<TenantBillingState> {
  const effective = await resolveEffectiveSubscription(tenantId);
  const { periodStart, periodEnd } = await getBillingPeriodForTenant(
    tenantId,
    atDate,
    effective
  );

  const existing = await prisma.tenantBillingState.findUnique({
    where: {
      tenantId_periodStart: { tenantId, periodStart },
    },
  });

  if (existing) return existing;

  // Resolve plan code for the new billing state row. We already loaded effective above;
  // pass it through so resolveTenantPlan does not query the subscription again (cold path).
  const { planCode } = await resolveTenantPlan(tenantId, effective);

  return prisma.tenantBillingState.upsert({
    where: {
      tenantId_periodStart: { tenantId, periodStart },
    },
    create: {
      tenantId,
      periodStart,
      periodEnd,
      status: "OPEN",
      rolloverRequests: 0,
      planCode,
    },
    update: {},
  });
}
