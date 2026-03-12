import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { writeAuditLog } from "@/server/services/audit";
import {
  getOrCreatePaddleCustomerForTenant,
  BillingEmailConflictError,
} from "@/server/billing/providers/paddle/customer/get-or-create-tenant-customer";
import { createCheckoutSession } from "@/server/billing/providers/paddle/create-checkout-session";
import { logCheckoutInitiated } from "@/server/billing/billing-log";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const checkoutBodySchema = z.object({
  planCode: z.enum(["starter", "pro", "enterprise"]),
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
  const { planCode } = parsed.data;

  const mapping = await prisma.tenantProviderCustomer.findUnique({
    where: { tenantId },
    select: { billingEmail: true },
  });
  const billingEmail = mapping?.billingEmail?.trim();
  if (!billingEmail) {
    return ApiErrors.VALIDATION_ERROR(
      "Billing email is required. Please set a billing email for this workspace before checkout.",
      { hint: "You can use an email alias (e.g. name+workspace@domain.com) if you want multiple workspaces." }
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  const customerName = tenant?.name?.trim() ?? session.user.name ?? null;

  try {
    const { id: providerCustomerId } = await getOrCreatePaddleCustomerForTenant({
      tenantId,
      billingEmail,
      customerName,
    });

    const result = await createCheckoutSession({
      tenantId,
      planCode,
      providerCustomerId,
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
    if (err instanceof BillingEmailConflictError) {
      return ApiErrors.VALIDATION_ERROR(err.message);
    }
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
