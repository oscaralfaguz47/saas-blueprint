import "server-only";

import { prisma } from "@/server/db";
import {
  getPeriodStartForDate,
  getPeriodEndForDate,
  getOrCreateBillingState,
} from "./get-or-create-billing-state";
import { resolveTenantPlan } from "./resolve-tenant-plan";
import { writeAuditLog } from "@/server/services/audit";

/**
 * Close billing periods that have ended (periodEnd in the past) and open next period with rollover.
 * Idempotent and batch-safe: safe to run daily for all tenants.
 * Optionally pass actorUserId for audit (e.g. when triggered by admin); when run by cron, use system actor if configured.
 */
export async function runPeriodClose(params?: {
  actorUserId?: string | null;
}): Promise<{ closed: number }> {
  const now = new Date();
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  const lastMonthEnd = getPeriodEndForDate(lastMonthStart);

  if (now <= lastMonthEnd) {
    return { closed: 0 };
  }

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
    const { tenantId, periodStart, planCode, rolloverRequests } = state;
    const resolved = await resolveTenantPlan(tenantId);
    const features = resolved.features;
    const req = features.requests;

    if (req.rolloverMonths === 0 || req.hardCap) {
      await prisma.tenantBillingState.update({
        where: { tenantId_periodStart: { tenantId, periodStart } },
        data: { status: "CLOSED" },
      });
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

    const nextPeriodStart = new Date(periodStart);
    nextPeriodStart.setUTCMonth(nextPeriodStart.getUTCMonth() + 1);
    const nextPeriodEnd = getPeriodEndForDate(nextPeriodStart);

    await prisma.$transaction([
      prisma.tenantBillingState.update({
        where: { tenantId_periodStart: { tenantId, periodStart } },
        data: { status: "CLOSED" },
      }),
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
