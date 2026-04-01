import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { getBillingPeriodForTenant } from "@/server/billing/get-or-create-billing-state";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { getPlanCatalogEntry } from "@/server/billing/plans/catalog";
import { apiSuccess, apiError, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const OVERAGE_MIN_BILLABLE_UNITS = 5;

const bodySchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * POST /api/admin/cron/billing-starter-overage/force-run
 * Platform admin only. Forces overage charge calculation for a specific tenant,
 * bypassing the 24h window check. For local development testing only.
 */
export const POST = withErrorHandler(async (req: Request) => {
  if (env.PADDLE_ENVIRONMENT === "production") {
    return apiError("FORBIDDEN", 403, "This endpoint is not available in production.");
  }

  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;

  let body: { tenantId: string };
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return apiError("VALIDATION_ERROR", 400, "tenantId is required");
  }

  const { tenantId } = body;

  const starterEntry = getPlanCatalogEntry("starter");
  if (!starterEntry || starterEntry.overageCentsPerRequest === null) {
    return apiError("INTERNAL_ERROR", 500, "Starter plan not found in catalog");
  }

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle", status: "ACTIVE" },
    select: {
      tenantId: true,
      currentPeriodEnd: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
    },
  });

  if (!sub) {
    return apiError("NOT_FOUND", 404, "No active Paddle subscription found for this tenant");
  }
  if (!sub.providerCustomerId) {
    return apiError("VALIDATION_ERROR", 400, "Subscription has no providerCustomerId");
  }

  const now = new Date();
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now;

  const { periodStart } = await getBillingPeriodForTenant(tenantId, periodEnd);
  const resolved = await resolveTenantPlan(tenantId);
  const included = resolved.requestsLimits.included;

  const [counter, rolloverLots] = await Promise.all([
    prisma.tenantUsageCounter.findUnique({
      where: {
        tenantId_periodStart_meter: { tenantId, periodStart, meter: "REQUESTS" },
      },
      select: { usedCount: true },
    }),
    prisma.tenantRolloverLot.findMany({
      where: { tenantId, expiresAt: { gt: now } },
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

  return apiSuccess({
    debug: {
      tenantId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      included,
      rolloverAvailable,
      totalAvailable,
      used,
      overageUnits,
      minBillableUnits: OVERAGE_MIN_BILLABLE_UNITS,
      wouldCharge: overageUnits >= OVERAGE_MIN_BILLABLE_UNITS,
      providerSubscriptionId: sub.providerSubscriptionId,
      providerCustomerId: sub.providerCustomerId,
    },
  });
});
