import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspaceDetailLimit } from "@/server/security/admin-rate-limit";
import { computeUsageSummary } from "@/server/billing/compute-usage-summary";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const GET = withErrorHandler(
  async (_req: Request, context: { params: Promise<{ tenantId: string }> }) => {
    const session = await getServerSession(authOptions);
    const authError = await requireAdminAuth(session, "admin.billing.read");
    if (authError) return authError;
    if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

    const rl = await checkAdminWorkspaceDetailLimit(session.user.id);
    if (!rl.allowed)
      return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
        retryAfterSeconds: rl.retryAfterSeconds,
      });

    const { tenantId } = paramsSchema.parse(await context.params);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

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
  }
);
