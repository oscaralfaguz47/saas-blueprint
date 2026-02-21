import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { resolveEffectiveSubscription } from "@/server/billing/resolve-effective-subscription";
import { writeAuditLog } from "@/server/services/audit";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { z } from "zod";

const changePlanBodySchema = z.object({
  planCode: z.enum(["free", "starter"]),
});

/** Only downgrade targets; upgrades use Paddle checkout. */
const PLAN_ORDER = ["free", "starter", "pro"] as const;

function isDowngrade(currentCode: string, targetCode: "free" | "starter"): boolean {
  const i = PLAN_ORDER.indexOf(currentCode as "free" | "starter" | "pro");
  const j = PLAN_ORDER.indexOf(targetCode);
  return i >= 0 && j >= 0 && j < i;
}

export const POST = withErrorHandler(async (req: Request) => {
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

  const body = await parseBody(req, changePlanBodySchema);

  const effective = await resolveEffectiveSubscription(tenantId);
  if (!effective) {
    return ApiErrors.VALIDATION_ERROR(
      "No active subscription found. Upgrade via checkout first."
    );
  }

  const currentCode = effective.planCode.toLowerCase();
  if (!isDowngrade(currentCode, body.planCode)) {
    return ApiErrors.VALIDATION_ERROR(
      "Only downgrades can be scheduled here. Use Change plan to upgrade via checkout."
    );
  }

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { currentPeriodEnd: "desc" },
    select: { id: true },
  });

  if (!subscription) {
    return ApiErrors.VALIDATION_ERROR(
      "No subscription found for this workspace."
    );
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      cancelAtPeriodEnd: true,
      pendingPlanCode: body.planCode,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.plan.changed",
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: {
      scheduledAtPeriodEnd: true,
      pendingPlanCode: body.planCode,
      previousPlanCode: currentCode,
    },
  });

  return apiSuccess({ ok: true });
});
