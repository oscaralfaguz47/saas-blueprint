import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { createCheckoutSession, TaxIdentifierValidationError } from "@/server/billing/providers/paddle/create-checkout-session";
import { logCheckoutInitiated, logCheckoutFailedValidation } from "@/server/billing/billing-log";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { prisma } from "@/server/db";

const billingAddressSchema = z.object({
  countryCode: z.string().length(2).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  firstLine: z.string().max(200).optional().nullable(),
  secondLine: z.string().max(200).optional().nullable(),
});

const checkoutBodySchema = z.object({
  planCode: z.enum(["starter", "pro"]),
  billing: z
    .object({
      address: billingAddressSchema.optional().nullable(),
      businessToggle: z.boolean().optional(),
      companyName: z.string().max(200).optional().nullable(),
      taxIdentifier: z.string().max(80).optional().nullable(),
    })
    .optional()
    .nullable(),
  skipTaxId: z.literal(true).optional(),
});

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

  const body = await parseBody(req, checkoutBodySchema);

  const existingProfile = await prisma.billingProfile.findUnique({
    where: { tenantId },
    select: {
      countryCode: true,
      postalCode: true,
      region: true,
      city: true,
      firstLine: true,
      secondLine: true,
      companyName: true,
      taxIdentifier: true,
    },
  });

  const b = body.billing;
  const hasAddressData =
    b?.address &&
    (b.address.countryCode?.trim() ||
      b.address.postalCode?.trim() ||
      b.address.region?.trim() ||
      b.address.city?.trim() ||
      b.address.firstLine?.trim() ||
      b.address.secondLine?.trim());
  const hasBusinessData =
    !!b?.companyName?.trim() || !!b?.taxIdentifier?.trim() || !!b?.businessToggle;
  const hasAnyBillingData = !!b && (!!hasAddressData || hasBusinessData);

  function trimOrUndefined(s: string | null | undefined): string | undefined {
    const t = s?.trim();
    return t === "" ? undefined : t ?? undefined;
  }

  if (hasAnyBillingData) {
    const addr = b?.address;
    const updatePayload = {
      countryCode:
        addr?.countryCode !== undefined
          ? trimOrUndefined(addr.countryCode) ?? null
          : existingProfile?.countryCode ?? undefined,
      postalCode:
        addr?.postalCode !== undefined
          ? trimOrUndefined(addr.postalCode) ?? null
          : existingProfile?.postalCode ?? undefined,
      region:
        addr?.region !== undefined
          ? trimOrUndefined(addr.region) ?? null
          : existingProfile?.region ?? undefined,
      city:
        addr?.city !== undefined
          ? trimOrUndefined(addr.city) ?? null
          : existingProfile?.city ?? undefined,
      firstLine:
        addr?.firstLine !== undefined
          ? trimOrUndefined(addr.firstLine) ?? null
          : existingProfile?.firstLine ?? undefined,
      secondLine:
        addr?.secondLine !== undefined
          ? trimOrUndefined(addr.secondLine) ?? null
          : existingProfile?.secondLine ?? undefined,
      companyName:
        b?.companyName !== undefined
          ? trimOrUndefined(b.companyName) ?? null
          : existingProfile?.companyName ?? undefined,
      taxIdentifier:
        b?.taxIdentifier !== undefined
          ? trimOrUndefined(b.taxIdentifier) ?? null
          : existingProfile?.taxIdentifier ?? undefined,
      updatedByUserId: session.user.id,
    };
    const createPayload = {
      tenantId,
      ...(updatePayload.countryCode != null && { countryCode: updatePayload.countryCode }),
      ...(updatePayload.postalCode != null && { postalCode: updatePayload.postalCode }),
      ...(updatePayload.region != null && { region: updatePayload.region }),
      ...(updatePayload.city != null && { city: updatePayload.city }),
      ...(updatePayload.firstLine != null && { firstLine: updatePayload.firstLine }),
      ...(updatePayload.secondLine != null && { secondLine: updatePayload.secondLine }),
      ...(updatePayload.companyName != null && { companyName: updatePayload.companyName }),
      ...(updatePayload.taxIdentifier != null && { taxIdentifier: updatePayload.taxIdentifier }),
      updatedByUserId: session.user.id,
    };
    const updateData: Record<string, unknown> = {
      ...(updatePayload.countryCode !== undefined && { countryCode: updatePayload.countryCode }),
      ...(updatePayload.postalCode !== undefined && { postalCode: updatePayload.postalCode }),
      ...(updatePayload.region !== undefined && { region: updatePayload.region }),
      ...(updatePayload.city !== undefined && { city: updatePayload.city }),
      ...(updatePayload.firstLine !== undefined && { firstLine: updatePayload.firstLine }),
      ...(updatePayload.secondLine !== undefined && { secondLine: updatePayload.secondLine }),
      ...(updatePayload.companyName !== undefined && { companyName: updatePayload.companyName }),
      ...(updatePayload.taxIdentifier !== undefined && { taxIdentifier: updatePayload.taxIdentifier }),
      updatedByUserId: session.user.id,
    };
    await prisma.billingProfile.upsert({
      where: { tenantId },
      create: createPayload as Parameters<typeof prisma.billingProfile.upsert>[0]["create"],
      update: updateData as Parameters<typeof prisma.billingProfile.upsert>[0]["update"],
    });
  }

  const countryCode =
    trimOrUndefined(b?.address?.countryCode) ?? existingProfile?.countryCode ?? null;
  const businessToggle = !!(b?.businessToggle && b?.companyName?.trim());
  const billingAddressForPaddle =
    countryCode && (b?.address || existingProfile)
      ? {
          countryCode: countryCode.toUpperCase(),
          postalCode: trimOrUndefined(b?.address?.postalCode ?? existingProfile?.postalCode) ?? undefined,
          region: trimOrUndefined(b?.address?.region ?? existingProfile?.region) ?? undefined,
          city: trimOrUndefined(b?.address?.city ?? existingProfile?.city) ?? undefined,
          firstLine: trimOrUndefined(b?.address?.firstLine ?? existingProfile?.firstLine) ?? undefined,
          secondLine: trimOrUndefined(b?.address?.secondLine ?? existingProfile?.secondLine) ?? undefined,
        }
      : undefined;
  const business =
    b?.companyName?.trim()
      ? {
          companyName: b.companyName.trim(),
          taxIdentifier: b.taxIdentifier?.trim() || null,
          countryCode: countryCode ?? "",
        }
      : undefined;

  try {
    const result = await createCheckoutSession({
      tenantId,
      planCode: body.planCode,
      customerEmail: session.user.email ?? "",
      customerName: session.user.name ?? null,
      billingAddress: billingAddressForPaddle ?? undefined,
      business: business ?? undefined,
      skipTaxId: body.skipTaxId,
    });

    if (result.paddleCustomerId) {
      await prisma.billingProfile.updateMany({
        where: { tenantId },
        data: {
          paddleCustomerId: result.paddleCustomerId,
          ...(result.paddleAddressId != null && { paddleAddressId: result.paddleAddressId }),
          ...(result.paddleBusinessId != null && { paddleBusinessId: result.paddleBusinessId }),
        } as Parameters<typeof prisma.billingProfile.updateMany>[0]["data"],
      });
    }

    logCheckoutInitiated({
      tenantId,
      planCode: body.planCode,
      country: countryCode ?? undefined,
      businessToggle,
    });

    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId,
      action: "tenant.billing.checkout_initiated",
      targetType: "Subscription",
      metadata: { planCode: body.planCode },
    });

    return apiSuccess({ checkoutUrl: result.checkoutUrl });
  } catch (err) {
    if (err instanceof TaxIdentifierValidationError) {
      logCheckoutFailedValidation({
        tenantId,
        planCode: body.planCode,
        country: countryCode ?? undefined,
        businessToggle,
        reason: err.message,
      });
      return ApiErrors.TAX_IDENTIFIER_VALIDATION_FAILED(err.message);
    }
    throw err;
  }
});
