import "server-only";

import { prisma } from "@/server/db";
import type { TenantBillingState } from "@prisma/client";
import { resolveTenantPlan } from "./resolve-tenant-plan";

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

export async function getOrCreateBillingState(
  tenantId: string,
  periodStart: Date
): Promise<TenantBillingState> {
  const normalizedStart = getPeriodStartForDate(periodStart);
  const periodEnd = getPeriodEndForDate(periodStart);

  const existing = await prisma.tenantBillingState.findUnique({
    where: {
      tenantId_periodStart: { tenantId, periodStart: normalizedStart },
    },
  });

  if (existing) return existing;

  const { planCode } = await resolveTenantPlan(tenantId);

  return prisma.tenantBillingState.upsert({
    where: {
      tenantId_periodStart: { tenantId, periodStart: normalizedStart },
    },
    create: {
      tenantId,
      periodStart: normalizedStart,
      periodEnd,
      status: "OPEN",
      rolloverRequests: 0,
      planCode,
    },
    update: {},
  });
}
