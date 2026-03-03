import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { syncBillingProfileFromPaddle } from "@/server/billing/billing-profile/sync-from-paddle";
import { updatePaddleBillingDetails } from "@/server/billing/paddle/customer/update-billing-details";
import { updateSubscriptionAddress } from "@/server/billing/paddle/subscriptions/update-subscription-address";
import { updateSubscriptionBusiness } from "@/server/billing/paddle/subscriptions/update-subscription-business";
import { writeAuditLog } from "@/server/services/audit";
import { sendEmail } from "@/server/services/invitation-email";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { z } from "zod";

const putBodySchema = z.object({
  companyName: z.string().max(160).optional().nullable(),
  vatId: z.string().max(64).optional().nullable(),
  addressLine1: z.string().max(120).optional().nullable(),
  addressLine2: z.string().max(120).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  postalCode: z.string().max(32).optional().nullable(),
});

/**
 * GET /api/billing/billing-details
 * Returns TenantBillingProfile for current tenant. Backfills from Paddle if missing/stale and tenant has providerCustomerId.
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

  let profile = await prisma.tenantBillingProfile.findUnique({
    where: { tenantId },
  });

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: { providerCustomerId: true },
  });
  if ((!profile || !profile.lastSyncedAt) && sub?.providerCustomerId) {
    await syncBillingProfileFromPaddle({
      tenantId,
      providerCustomerId: sub.providerCustomerId,
    });
    profile = await prisma.tenantBillingProfile.findUnique({
      where: { tenantId },
    });
  }

  if (!profile) {
    return apiSuccess({
      profile: null,
      message: "No billing profile yet. Complete a purchase to set billing details.",
    });
  }

  return apiSuccess({
    profile: {
      countryCode: profile.countryCode,
      postalCode: profile.postalCode,
      region: profile.region,
      city: profile.city,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      companyName: profile.companyName,
      vatId: profile.vatId,
      lastSyncedAt: profile.lastSyncedAt?.toISOString() ?? null,
    },
  });
});

/**
 * PUT /api/billing/billing-details
 * Update editable billing fields (future invoices). Updates Paddle + DB; notifies platform admin.
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

  const sub = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: { providerCustomerId: true, providerSubscriptionId: true },
  });

  const profile = await prisma.tenantBillingProfile.findUnique({
    where: { tenantId },
    select: { providerAddressId: true, providerBusinessId: true },
  });

  let addressIdUsed: string | undefined = undefined;
  let businessIdUsed: string | undefined = undefined;
  if (sub?.providerCustomerId) {
    const result = await updatePaddleBillingDetails({
      providerCustomerId: sub.providerCustomerId,
      providerAddressId: profile?.providerAddressId ?? undefined,
      providerBusinessId: profile?.providerBusinessId ?? undefined,
      companyName: body.companyName ?? undefined,
      vatId: body.vatId ?? undefined,
      addressLine1: body.addressLine1 ?? undefined,
      addressLine2: body.addressLine2 ?? undefined,
      city: body.city ?? undefined,
      region: body.region ?? undefined,
      postalCode: body.postalCode ?? undefined,
      description: sub.providerSubscriptionId ?? undefined,
    });
    if (!result.ok) {
      return ApiErrors.VALIDATION_ERROR(result.error ?? "Failed to update billing details.");
    }
    addressIdUsed = result.addressIdUsed;
    businessIdUsed = result.businessIdUsed;

    if (addressIdUsed && sub.providerSubscriptionId) {
      try {
        await updateSubscriptionAddress(sub.providerSubscriptionId, addressIdUsed);
      } catch {
        // Non-blocking: customer address and profile are updated; subscription address best-effort
      }
    }
    if (businessIdUsed && sub.providerSubscriptionId) {
      try {
        await updateSubscriptionBusiness(sub.providerSubscriptionId, businessIdUsed);
      } catch {
        // Non-blocking: customer business and profile are updated; subscription business best-effort
      }
    }
  }

  await prisma.tenantBillingProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      countryCode: "US",
      postalCode: body.postalCode ?? null,
      region: body.region ?? null,
      city: body.city ?? null,
      addressLine1: body.addressLine1 ?? null,
      addressLine2: body.addressLine2 ?? null,
      companyName: body.companyName ?? null,
      vatId: body.vatId ?? null,
      lastSyncedAt: new Date(),
      syncSource: "manual",
      updatedByUserId: session.user.id,
      ...(addressIdUsed ? { providerAddressId: addressIdUsed } : {}),
      ...(businessIdUsed ? { providerBusinessId: businessIdUsed } : {}),
    },
    update: {
      postalCode: body.postalCode ?? undefined,
      region: body.region ?? undefined,
      city: body.city ?? undefined,
      addressLine1: body.addressLine1 ?? undefined,
      addressLine2: body.addressLine2 ?? undefined,
      companyName: body.companyName ?? undefined,
      vatId: body.vatId ?? undefined,
      lastSyncedAt: new Date(),
      syncSource: "manual",
      updatedByUserId: session.user.id,
      ...(addressIdUsed ? { providerAddressId: addressIdUsed } : {}),
      ...(businessIdUsed ? { providerBusinessId: businessIdUsed } : {}),
    },
  });

  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length > 0) {
    try {
      await sendEmail({
        to: adminEmails[0],
        subject: "Billing profile updated",
        html: `<p>Tenant ${tenantId} updated billing details (future invoices).</p>`,
      });
    } catch {
      // non-blocking
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.billing_profile_updated",
    targetType: "TenantBillingProfile",
    targetId: tenantId,
    metadata: {},
  });

  return apiSuccess({ ok: true });
});
