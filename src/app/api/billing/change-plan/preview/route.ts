import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { type PlanCode, isUpgrade } from "@/lib/billing/plan-catalog";
import { getPlanCatalogEntry } from "@/server/billing/plans/catalog";
import { z } from "zod";

const querySchema = z.object({
  targetPlanCode: z.enum(["free", "starter", "pro", "scale"]),
  billingInterval: z.enum(["monthly", "annual"]).optional().default("monthly"),
});

/**
 * GET /api/billing/change-plan/preview?targetPlanCode=...
 * Returns preview for confirm modal: current plan, target plan, effective date, payment method hint.
 * Requires auth + MFA + tenant.billing.manage + current tenant context.
 */
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

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    targetPlanCode: url.searchParams.get("targetPlanCode") ?? undefined,
    billingInterval: url.searchParams.get("billingInterval") ?? undefined,
  });
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("targetPlanCode is required and must be free|starter|pro|scale");
  }
  const targetPlanCode = parsed.data.targetPlanCode;
  const billingInterval = parsed.data.billingInterval ?? "monthly";

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      currentPeriodEnd: true,
      currency: true,
      planId: true,
      plan: { select: { code: true } },
      providerSubscriptionId: true,
    },
  });

  const currentPlanCode = (subscription?.plan?.code ?? "free").toLowerCase();
  const currentPlanCodeForCatalog: PlanCode =
    currentPlanCode === "enterprise" ? "scale" : (currentPlanCode as PlanCode);

  if (targetPlanCode === "free") {
    const effectiveFromDate = subscription?.currentPeriodEnd ?? null;
    return apiSuccess({
      currentPlanCode,
      targetPlanCode,
      effectiveAt: "next_period" as const,
      effectiveFromDate: effectiveFromDate?.toISOString() ?? null,
      currentPeriodEnd: effectiveFromDate?.toISOString() ?? null,
      currency: subscription?.currency ?? "USD",
      nextPriceCents: null,
      requiresCheckout: false,
      billingInterval,
    });
  }

  const targetPlan = await prisma.plan.findUnique({
    where: { code: targetPlanCode, isActive: true },
    select: { priceMonthly: true, priceYearly: true },
  });
  const targetPlanCatalog = getPlanCatalogEntry(targetPlanCode);
  const nextPriceCents =
    billingInterval === "annual"
      ? (targetPlanCatalog?.priceYearly ?? targetPlan?.priceYearly ?? targetPlan?.priceMonthly ?? null)
      : (targetPlanCatalog?.priceMonthly ?? targetPlan?.priceMonthly ?? null);

  if (!subscription?.providerSubscriptionId) {
    return apiSuccess({
      currentPlanCode,
      targetPlanCode,
      effectiveAt: "immediate" as const,
      effectiveFromDate: null,
      currentPeriodEnd: null,
      currency: "USD",
      nextPriceCents,
      requiresCheckout: true,
      billingInterval,
    });
  }

  const effectiveFromDate = subscription.currentPeriodEnd;
  const effectiveAt = isUpgrade(currentPlanCodeForCatalog, targetPlanCode)
    ? ("immediate" as const)
    : ("next_period" as const);

  return apiSuccess({
    currentPlanCode,
    targetPlanCode,
    effectiveAt,
    effectiveFromDate: effectiveFromDate?.toISOString() ?? null,
    currentPeriodEnd: effectiveFromDate?.toISOString() ?? null,
    currency: subscription.currency ?? "USD",
    nextPriceCents,
    requiresCheckout: false,
    billingInterval,
  });
});
