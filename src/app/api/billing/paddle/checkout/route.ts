import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { writeAuditLog } from "@/server/services/audit";
import { createCheckoutSession } from "@/server/billing/providers/paddle/create-checkout-session";
import { logCheckoutInitiated } from "@/server/billing/billing-log";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const checkoutBodySchema = z.object({
  planCode: z.enum(["starter", "pro", "scale"]),
  billingInterval: z.enum(["monthly", "annual"]).optional().default("monthly"),
});

export const POST = withErrorHandler(async (req: Request) => {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body format");
  }

  const parsed = checkoutBodySchema.safeParse(body);
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", {
      details: parsed.error.flatten(),
    });
  }
  const { planCode, billingInterval } = parsed.data;

  const customerEmail = session.user.email?.trim();
  if (!customerEmail) {
    return ApiErrors.VALIDATION_ERROR("User email is required for checkout.");
  }

  try {
    const result = await createCheckoutSession({
      tenantId,
      planCode,
      customerEmail,
      customerName: session.user.name ?? null,
      billingInterval,
    });

    logCheckoutInitiated({
      tenantId,
      planCode,
    });

    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId,
      action: "tenant.billing.checkout_initiated",
      targetType: "Subscription",
      metadata: { planCode },
    });

    return apiSuccess({
      transactionId: result.transactionId,
      environment: result.environment,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Cannot checkout free plan")) {
      return ApiErrors.VALIDATION_ERROR("Free plan cannot be checked out.");
    }
    if (message.includes("Already have an active subscription")) {
      return ApiErrors.VALIDATION_ERROR("Already have an active subscription for this plan.");
    }
    if (message.includes("Plan not found")) {
      return ApiErrors.VALIDATION_ERROR("Plan not found.");
    }
    throw err;
  }
});
