import "server-only";

import { prisma } from "@/server/db";
import type { MeterKey } from "@prisma/client";
import {
  getPeriodStartForDate,
  getPeriodEndForDate,
  getOrCreateBillingState,
} from "./get-or-create-billing-state";
import { resolveTenantPlan } from "./resolve-tenant-plan";

export type UsageSummaryResult = {
  planCode: string;
  subscriptionStatus: string;
  periodStart: Date;
  periodEnd: Date;
  cancelAtPeriodEnd: boolean;
  graceUntil: Date | null;
  /** Per-meter: included, rolloverAvailable, used, overageUnits, overageEstimateCents. */
  meters: {
    requests: MeterSummary;
    pdfExports: MeterSummary;
    zipExports: MeterSummary;
  };
  /** 80% of allowance reached (requests). */
  threshold80: boolean;
  /** 100% of allowance reached (requests; may still allow overage on paid plans). */
  threshold100: boolean;
  /** Overage cap reached (Starter only). */
  overageCapReached: boolean;
};

export type MeterSummary = {
  included: number;
  rolloverAvailable: number;
  used: number;
  overageUnits: number;
  overageEstimateCents: number;
};

export async function computeUsageSummary(
  tenantId: string,
  atDate: Date = new Date()
): Promise<UsageSummaryResult> {
  const periodStart = getPeriodStartForDate(atDate);
  const periodEnd = getPeriodEndForDate(atDate);

  await getOrCreateBillingState(tenantId, atDate);

  const [resolved, billingState, counters] = await Promise.all([
    resolveTenantPlan(tenantId),
    prisma.tenantBillingState.findUnique({
      where: { tenantId_periodStart: { tenantId, periodStart } },
    }),
    prisma.tenantUsageCounter.findMany({
      where: { tenantId, periodStart },
      select: { meter: true, usedCount: true },
    }),
  ]);

  const rawRollover = billingState?.rolloverRequests ?? 0;
  const reqLimits = resolved.requestsLimits;
  const reqIncluded = reqLimits.included;
  /** Free plan has rollover disabled (rolloverMonths: 0); do not show or use stored rollover. */
  const rolloverAvailable =
    reqLimits.rolloverMonths === 0 ? 0 : rawRollover;
  const reqUsed =
    counters.find((c) => c.meter === "REQUESTS")?.usedCount ?? 0;
  const reqOverageUnits = Math.max(
    0,
    reqUsed - reqIncluded - rolloverAvailable
  );
  const reqOverageCents =
    reqLimits.overageCentsPerUnit != null
      ? Math.min(
          reqOverageUnits * reqLimits.overageCentsPerUnit,
          reqLimits.overageCapCents ?? Number.POSITIVE_INFINITY
        )
      : 0;

  const pdfIncluded = resolved.features.pdf.included;
  const pdfUsed =
    counters.find((c) => c.meter === "PDF_EXPORTS")?.usedCount ?? 0;
  const pdfOverageUnits =
    pdfIncluded < 0 ? 0 : Math.max(0, pdfUsed - pdfIncluded);
  const pdfOverageCents = 0;

  const zipUsed =
    counters.find((c) => c.meter === "ZIP_EXPORTS")?.usedCount ?? 0;
  const zipIncluded = resolved.features.zip.enabled ? 1 : 0;

  const totalAllowance = reqIncluded + rolloverAvailable;
  const threshold80 = totalAllowance > 0 && reqUsed >= totalAllowance * 0.8;
  const threshold100 = totalAllowance > 0 && reqUsed >= totalAllowance;
  const overageCapReached =
    reqLimits.overageCapCents != null &&
    reqOverageCents >= reqLimits.overageCapCents;

  return {
    planCode: resolved.planCode,
    subscriptionStatus: resolved.subscriptionStatus,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
    graceUntil: resolved.graceUntil,
    meters: {
      requests: {
        included: reqIncluded,
        rolloverAvailable,
        used: reqUsed,
        overageUnits: reqOverageUnits,
        overageEstimateCents: reqOverageCents,
      },
      pdfExports: {
        included: pdfIncluded < 0 ? -1 : pdfIncluded,
        rolloverAvailable: 0,
        used: pdfUsed,
        overageUnits: pdfOverageUnits,
        overageEstimateCents: pdfOverageCents,
      },
      zipExports: {
        included: zipIncluded,
        rolloverAvailable: 0,
        used: zipUsed,
        overageUnits: 0,
        overageEstimateCents: 0,
      },
    },
    threshold80,
    threshold100,
    overageCapReached,
  };
}
