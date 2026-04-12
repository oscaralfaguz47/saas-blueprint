import "server-only";

import { prisma } from "@/server/db";
import type { MeterKey } from "@prisma/client";
import {
  getPeriodStartForDate,
  getPeriodEndForDate,
  getOrCreateBillingState,
} from "./get-or-create-billing-state";
import { resolveTenantPlan } from "./resolve-tenant-plan";

export class UpgradeRequiredError extends Error {
  constructor(message = "Plan limit reached. Upgrade required.") {
    super(message);
    this.name = "UpgradeRequiredError";
  }
}

export type ConsumeMeterParams = {
  tenantId: string;
  meter: MeterKey;
  delta: number;
  idempotencyKey: string;
  sourceType: string;
  sourceId?: string | null;
  actorUserId?: string | null;
  /** For REQUESTS: period derived from subscription or now. Caller can pass to avoid re-resolution. */
  periodStart?: Date;
};

export type UsageSummary = {
  periodStart: Date;
  periodEnd: Date;
  planCode: string;
  used: number;
  included: number;
  rolloverAvailable: number;
  overageUnits: number;
  overageEstimateCents: number;
};

/**
 * Read-only check: throws UpgradeRequiredError if consuming delta would exceed plan limit.
 * Use before performing the action; then call tryConsumeMeter after success (increment only after success).
 */
export async function checkMeterLimit(params: {
  tenantId: string;
  meter: MeterKey;
  delta: number;
  periodStart?: Date;
}): Promise<void> {
  const { tenantId, meter, delta, periodStart: maybePeriodStart } = params;

  if (delta <= 0) return;

  const resolved = await resolveTenantPlan(tenantId);

  if (resolved.isBlocked) {
    throw new UpgradeRequiredError(
      "Subscription is suspended or canceled. Upgrade or renew to continue."
    );
  }

  const periodStart = maybePeriodStart
    ? getPeriodStartForDate(maybePeriodStart)
    : resolved.currentPeriodStart
      ? getPeriodStartForDate(resolved.currentPeriodStart)
      : getPeriodStartForDate(new Date());

  await getOrCreateBillingState(tenantId, periodStart);

  const billingState = await prisma.tenantBillingState.findUnique({
    where: { tenantId_periodStart: { tenantId, periodStart } },
  });
  if (!billingState) return;

  const limits = resolved.requestsLimits;
  const included = limits.included;
  const rolloverAvailable = billingState.rolloverRequests;
  const totalAllowance = included + rolloverAvailable;
  const hardCap = limits.hardCap;

  const counter = await prisma.tenantUsageCounter.findUnique({
    where: {
      tenantId_periodStart_meter: { tenantId, periodStart, meter },
    },
  });
  const usedBefore = counter?.usedCount ?? 0;
  const usedAfter = usedBefore + delta;

  if (meter === "REQUESTS") {
    // -1 = unlimited; never block
    if (included !== -1 && usedAfter > totalAllowance && hardCap) {
      throw new UpgradeRequiredError(
        "Request limit reached for this period. Upgrade to add more."
      );
    }
  }
}

export async function tryConsumeMeter(
  params: ConsumeMeterParams
): Promise<UsageSummary> {
  const {
    tenantId,
    meter,
    delta,
    idempotencyKey,
    sourceType,
    sourceId,
    actorUserId,
    periodStart: maybePeriodStart,
  } = params;

  if (delta <= 0) {
    throw new Error("tryConsumeMeter: delta must be positive");
  }

  return prisma.$transaction(async (tx) => {
    const resolved = await resolveTenantPlan(tenantId);

    if (resolved.isBlocked) {
      throw new UpgradeRequiredError(
        "Subscription is suspended or canceled. Upgrade or renew to continue."
      );
    }

    const periodStart = maybePeriodStart
      ? getPeriodStartForDate(maybePeriodStart)
      : resolved.currentPeriodStart
        ? getPeriodStartForDate(resolved.currentPeriodStart)
        : getPeriodStartForDate(new Date());
    const periodEnd = getPeriodEndForDate(periodStart);

    await getOrCreateBillingState(tenantId, periodStart);

    const billingState = await tx.tenantBillingState.findUnique({
      where: { tenantId_periodStart: { tenantId, periodStart } },
    });
    if (!billingState) throw new Error("Billing state missing after getOrCreate");

    const limits = resolved.requestsLimits;
    const included = limits.included;
    const rolloverAvailable = billingState.rolloverRequests;
    const totalAllowance = included + rolloverAvailable;
    const hardCap = limits.hardCap;

    const counter = await tx.tenantUsageCounter.findUnique({
      where: {
        tenantId_periodStart_meter: { tenantId, periodStart, meter },
      },
    });
    const usedBefore = counter?.usedCount ?? 0;
    const usedAfter = usedBefore + delta;

    if (meter === "REQUESTS") {
      // -1 = unlimited; never block
      if (included !== -1 && usedAfter > totalAllowance && hardCap) {
        throw new UpgradeRequiredError(
          "Request limit reached for this period. Upgrade to add more."
        );
      }
    }
    // PDF_EXPORTS / ZIP_EXPORTS: TODO when export flows are implemented; same pattern with their limits.

    const existingLedger = await tx.tenantUsageLedger.findUnique({
      where: { idempotencyKey },
    });
    if (existingLedger) {
      const counterAfter = await tx.tenantUsageCounter.findUnique({
        where: {
          tenantId_periodStart_meter: { tenantId, periodStart, meter },
        },
      });
      const used = counterAfter?.usedCount ?? usedBefore;
      const rolloverNow = (await tx.tenantBillingState.findUnique({
        where: { tenantId_periodStart: { tenantId, periodStart } },
      }))?.rolloverRequests ?? 0;
      const overageUnits =
        included === -1 ? 0 : Math.max(0, used - included - rolloverNow);
      const overageCents =
        limits.overageCentsPerUnit != null
          ? Math.min(
              overageUnits * limits.overageCentsPerUnit,
              limits.overageCapCents ?? Number.POSITIVE_INFINITY
            )
          : 0;
      return {
        periodStart,
        periodEnd,
        planCode: resolved.planCode,
        used,
        included,
        rolloverAvailable: rolloverNow,
        overageUnits,
        overageEstimateCents: overageCents,
      };
    }

    await tx.tenantUsageLedger.create({
      data: {
        tenantId,
        periodStart,
        meter,
        delta,
        idempotencyKey,
        sourceType,
        sourceId: sourceId ?? null,
        actorUserId: actorUserId ?? null,
      },
    });

    const updatedCounter = await tx.tenantUsageCounter.upsert({
      where: {
        tenantId_periodStart_meter: { tenantId, periodStart, meter },
      },
      create: {
        tenantId,
        periodStart,
        meter,
        usedCount: delta,
        version: 1,
      },
      update: {
        usedCount: { increment: delta },
        version: { increment: 1 },
      },
    });
    const used = updatedCounter.usedCount;

    if (
      meter === "REQUESTS" &&
      included !== -1 &&
      rolloverAvailable > 0 &&
      used > included
    ) {
      await tx.tenantBillingState.update({
        where: { tenantId_periodStart: { tenantId, periodStart } },
        data: { rolloverRequests: { decrement: 1 } },
      });
    }

    const billingAfter = await tx.tenantBillingState.findUnique({
      where: { tenantId_periodStart: { tenantId, periodStart } },
    });
    const rolloverNow = billingAfter?.rolloverRequests ?? 0;
    const overageUnits =
      included === -1 ? 0 : Math.max(0, used - included - rolloverNow);
    const overageCap = limits.overageCapCents ?? Number.POSITIVE_INFINITY;
    const overageEstimateCents =
      limits.overageCentsPerUnit != null
        ? Math.min(
            overageUnits * limits.overageCentsPerUnit,
            overageCap
          )
        : 0;

    return {
      periodStart,
      periodEnd,
      planCode: resolved.planCode,
      used,
      included,
      rolloverAvailable: rolloverNow,
      overageUnits,
      overageEstimateCents,
    };
  });
}
