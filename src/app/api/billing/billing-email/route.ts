import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import {
  normalizeBillingEmail,
} from "@/server/billing/providers/paddle/customer/get-or-create-tenant-customer";
import { writeAuditLog } from "@/server/services/audit";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";

const putBodySchema = z.object({
  billingEmail: z.string().min(1, "Billing email is required").max(191).email("Invalid email format"),
});

const PADDLE_PROVIDER = "paddle";

/**
 * GET /api/billing/billing-email
 * Returns the current tenant's billing email (if set). Used for checkout prerequisite check.
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

  const mapping = await prisma.tenantProviderCustomer.findUnique({
    where: { tenantId },
    select: { billingEmail: true },
  });

  return apiSuccess({
    billingEmail: mapping?.billingEmail ?? null,
  });
});

/**
 * PUT /api/billing/billing-email
 * Set or update the tenant's billing email (required before first checkout).
 * Must be unique across workspaces; use an alias (e.g. name+workspace@domain.com) for multiple workspaces.
 */
export const PUT = withErrorHandler(async (req: Request) => {
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

  const body = await parseBody(req, putBodySchema);
  const normalized = normalizeBillingEmail(body.billingEmail);

  const existing = await prisma.tenantProviderCustomer.findUnique({
    where: { tenantId },
    select: { providerCustomerId: true },
  });

  if (existing?.providerCustomerId) {
    return ApiErrors.VALIDATION_ERROR(
      "Billing email cannot be changed after the first checkout. Contact support if you need to update it."
    );
  }

  try {
    await prisma.tenantProviderCustomer.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: PADDLE_PROVIDER,
        billingEmail: normalized,
      },
      update: { billingEmail: normalized },
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return ApiErrors.VALIDATION_ERROR(
        "This billing email is already used by another workspace. Please choose a different billing email (you may use an email alias like name+workspace@domain.com)."
      );
    }
    throw e;
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.billing_email_set",
    targetType: "TenantProviderCustomer",
    targetId: tenantId,
    metadata: {},
  });

  return apiSuccess({ ok: true });
});
