import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { computeUsageSummary } from "@/server/billing/compute-usage-summary";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenant?.id;
  if (!tenantId) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.billing.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const summary = await computeUsageSummary(tenantId);

  const req = summary.meters.requests;
  return apiSuccess({
    planCode: summary.planCode,
    subscriptionStatus: summary.subscriptionStatus,
    periodStart: summary.periodStart.toISOString(),
    periodEnd: summary.periodEnd.toISOString(),
    included: req.included,
    rolloverAvailable: req.rolloverAvailable,
    used: req.used,
    overageEstimate: req.overageEstimateCents,
    threshold80: summary.threshold80,
    threshold100: summary.threshold100,
    overageCapReached: summary.overageCapReached,
    meters: {
      pdfExports: summary.meters.pdfExports,
      zipExports: summary.meters.zipExports,
    },
  });
});
