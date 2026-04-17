import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { computeUsageSummary } from "@/server/billing/compute-usage-summary";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const permError = await requireTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.billing.manage",
  });
  if (permError) return permError;

  const summary = await computeUsageSummary(tenantId);

  const reqMeters = summary.meters.requests;
  return apiSuccess({
    planCode: summary.planCode,
    billingInterval: summary.billingInterval,
    subscriptionStatus: summary.subscriptionStatus,
    periodStart: summary.periodStart.toISOString(),
    periodEnd: summary.periodEnd.toISOString(),
    cancelAtPeriodEnd: summary.cancelAtPeriodEnd,
    pendingPlanCode: summary.pendingPlanCode ?? null,
    pendingBillingInterval: summary.pendingBillingInterval ?? null,
    pendingChangeType: summary.pendingChangeType ?? null,
    entitlementEffectiveUntil: summary.entitlementEffectiveUntil?.toISOString() ?? null,
    paymentStatus: summary.paymentStatus ?? null,
    graceEndsAt: summary.graceEndsAt?.toISOString() ?? null,
    pastDueSince: summary.pastDueSince?.toISOString() ?? null,
    graceUntil: summary.graceUntil?.toISOString() ?? null,
    included: reqMeters.included,
    rolloverAvailable: reqMeters.rolloverAvailable,
    used: reqMeters.used,
    overageEstimate: reqMeters.overageEstimateCents,
    threshold80: summary.threshold80,
    threshold100: summary.threshold100,
    overageCapReached: summary.overageCapReached,
    meters: {
      pdfExports: summary.meters.pdfExports,
      zipExports: summary.meters.zipExports,
    },
  });
});
