import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { getBillingPeriodForTenant } from "../get-or-create-billing-state";
import { resolveTenantPlan } from "../resolve-tenant-plan";
import { getPlanCatalogEntry } from "../plans/catalog";
import { writeAuditLog } from "@/server/services/audit";

const OVERAGE_UNIT_CENTS = 25; // $0.25 per request (Starter)
const BATCH_SIZE = 50;

/** Minimum overage units before creating a Paddle charge.
 *  Paddle rejects one-time charges below ~$0.70.
 *  At $0.25/unit, 3 units = $0.75 is the technical floor.
 *  We use 5 units ($1.25) as the product-level minimum for a clean threshold.
 *  Tenants with 1–4 overage units in a period are not charged. */
const OVERAGE_MIN_BILLABLE_UNITS = 5;

/**
 * EPIC 5: For Starter tenants nearing period end, compute overage and create Paddle one-time charge
 * effective_from next_billing_period. Persist TenantOverageCharge for idempotence.
 * Returns count of overage charges scheduled.
 */
export async function runStarterOverageScheduling(params?: {
  actorUserId?: string | null;
}): Promise<{ scheduled: number }> {
  const now = new Date();
  const starterEntry = getPlanCatalogEntry("starter");
  if (!starterEntry || starterEntry.overageCentsPerRequest === null) {
    return { scheduled: 0 };
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      provider: "paddle",
      status: "ACTIVE",
      plan: { code: "starter" },
      currentPeriodEnd: { not: null },
    },
    select: {
      tenantId: true,
      currentPeriodEnd: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
    },
    take: BATCH_SIZE,
  });

  let scheduled = 0;
  for (const sub of subscriptions) {
    if (!sub.currentPeriodEnd || !sub.providerCustomerId) continue;
    const periodEnd = new Date(sub.currentPeriodEnd);
    const hoursUntilEnd = (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60);
    // Process tenants within 24h before period end OR up to 2h after period end
    // (safety window to catch charges missed if tenant hit threshold in last minutes of period)
    if (hoursUntilEnd > 24 || hoursUntilEnd < -2) continue;

    const { periodStart } = await getBillingPeriodForTenant(
      sub.tenantId,
      periodEnd
    );
    const resolved = await resolveTenantPlan(sub.tenantId);
    const included = resolved.requestsLimits.included;

    const [counter, rolloverLots] = await Promise.all([
      prisma.tenantUsageCounter.findUnique({
        where: {
          tenantId_periodStart_meter: {
            tenantId: sub.tenantId,
            periodStart,
            meter: "REQUESTS",
          },
        },
        select: { usedCount: true },
      }),
      prisma.tenantRolloverLot.findMany({
        where: { tenantId: sub.tenantId, expiresAt: { gt: now } },
        select: { granted: true, used: true },
      }),
    ]);

    const used = counter?.usedCount ?? 0;
    const rolloverAvailable = rolloverLots.reduce(
      (sum, lot) => sum + Math.max(0, lot.granted - lot.used),
      0
    );
    const totalAvailable = included + Math.min(rolloverAvailable, starterEntry.rolloverMaxAvailable);
    const overageUnits = Math.max(0, used - totalAvailable);
    if (overageUnits < OVERAGE_MIN_BILLABLE_UNITS) continue;

    const existing = await prisma.tenantOverageCharge.findUnique({
      where: {
        tenantId_periodStart_meter: {
          tenantId: sub.tenantId,
          periodStart,
          meter: "REQUESTS",
        },
      },
    });
    if (existing) continue;

    const unitPriceCents = starterEntry.overageCentsPerRequest;
    const totalCents = overageUnits * unitPriceCents;

    const providerChargeId = await createPaddleOneTimeCharge({
      subscriptionId: sub.providerSubscriptionId!,
      customerId: sub.providerCustomerId,
      units: overageUnits,
      unitPriceCents,
      effectiveFromNextBillingPeriod: true,
    });

    await prisma.tenantOverageCharge.create({
      data: {
        tenantId: sub.tenantId,
        periodStart,
        meter: "REQUESTS",
        units: overageUnits,
        unitPriceCents,
        totalCents,
        provider: "paddle",
        providerChargeId: providerChargeId ?? undefined,
        status: providerChargeId ? "billed" : "scheduled",
      },
    });

    if (params?.actorUserId) {
      await writeAuditLog({
        actorUserId: params.actorUserId,
        actorContext: "TENANT",
        tenantId: sub.tenantId,
        action: "tenant.billing.overage_scheduled",
        targetType: "TenantOverageCharge",
        targetId: `${sub.tenantId}:${periodStart.toISOString()}`,
        metadata: { overageUnits, totalCents },
      });
    }
    scheduled++;
  }

  return { scheduled };
}

/**
 * Create Paddle one-time charge effective from next billing period.
 * Returns provider charge id if Paddle supports it.
 */
async function createPaddleOneTimeCharge(params: {
  subscriptionId: string;
  customerId: string;
  units: number;
  unitPriceCents: number;
  effectiveFromNextBillingPeriod: boolean;
}): Promise<string | null> {
  const priceId = env.PADDLE_PRICE_ID_STARTER_OVERAGE_REQUEST;
  if (!priceId) {
    return null;
  }
  const base = env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
  const key = env.PADDLE_API_KEY;
  if (!key) return null;

  try {
    const requestBody = {
      items: [
        {
          price_id: priceId,
          quantity: params.units,
        },
      ],
      effective_from: params.effectiveFromNextBillingPeriod
        ? "next_billing_period"
        : "immediate",
    };
    const res = await fetch(`${base}/subscriptions/${params.subscriptionId}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify(requestBody),
    });
    const responseText = await res.text();
    if (!res.ok) return null;
    const json = JSON.parse(responseText) as { data?: { id?: string } };
    return json?.data?.id ?? null;
  } catch {
    return null;
  }
}
