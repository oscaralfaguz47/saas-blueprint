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
import { zodErrorToFieldErrors } from "@/lib/validations/common";
import { isPostalCodeRequiredForCheckout } from "@/lib/billing/country-rules";
import { prisma } from "@/server/db";

/** Billing address is optional. When country is provided, city/firstLine and (per country) postal/region are validated in the handler. */
const billingAddressSchema = z.object({
  countryCode: z
    .string()
    .max(2, "Please select your country.")
    .optional()
    .nullable()
    .transform((v) => v ?? ""),
  city: z
    .string()
    .max(120, "City must be 120 characters or less.")
    .optional()
    .nullable()
    .transform((v) => v ?? ""),
  firstLine: z
    .string()
    .max(200, "Address line 1 must be 200 characters or less.")
    .optional()
    .nullable()
    .transform((v) => v ?? ""),
  postalCode: z
    .string()
    .max(20, "Postal code must be 20 characters or less.")
    .optional()
    .nullable()
    .transform((v) => v ?? ""),
  region: z
    .string()
    .max(80, "Region must be 80 characters or less.")
    .optional()
    .nullable()
    .transform((v) => v ?? ""),
  secondLine: z
    .string()
    .max(200, "Address line 2 must be 200 characters or less.")
    .optional()
    .nullable()
    .transform((v) => v ?? ""),
});

const contactSchema = z.object({
  name: z
    .string()
    .min(1, "Contact name is required.")
    .max(200, "Contact name must be 200 characters or less.")
    .trim(),
  email: z
    .string()
    .min(1, "Contact email is required.")
    .email("Please enter a valid email address.")
    .max(191, "Email must be 191 characters or less.")
    .trim(),
});

const checkoutBodySchema = z.object({
  planCode: z.enum(["starter", "pro"]),
  contact: contactSchema,
  billing: z.object({
    address: billingAddressSchema,
    businessToggle: z.boolean().optional(),
    companyName: z
      .string()
      .max(200, "Company name must be 200 characters or less.")
      .optional()
      .nullable(),
    taxIdentifier: z
      .string()
      .max(80, "Tax/VAT number must be 80 characters or less.")
      .optional()
      .nullable(),
  }),
  skipTaxId: z.literal(true).optional(),
});

/** Append country_code to checkout URL so Paddle prefills the country from our modal. */
function appendCountryToCheckoutUrl(url: string, countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("country_code", countryCode.toUpperCase());
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Maps Zod path to UI field key for checkout form. */
function checkoutPathToKey(path: (string | number)[]): string {
  const p = path as string[];
  if (p[0] === "contact" && p[1] === "name") return "contactName";
  if (p[0] === "contact" && p[1] === "email") return "contactEmail";
  if (p[0] === "billing" && p[1] === "address") {
    if (p[2] === "countryCode") return "billingCountryCode";
    if (p[2] === "postalCode") return "billingPostalCode";
    if (p[2] === "region") return "billingRegion";
    if (p[2] === "city") return "billingCity";
    if (p[2] === "firstLine") return "billingFirstLine";
    if (p[2] === "secondLine") return "billingSecondLine";
  }
  if (p[0] === "billing" && p[1] === "companyName") return "companyName";
  if (p[0] === "billing" && p[1] === "taxIdentifier") return "taxIdentifier";
  return "";
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body format");
  }

  const parsed = checkoutBodySchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = zodErrorToFieldErrors(parsed.error, checkoutPathToKey);
    return ApiErrors.VALIDATION_ERROR("Validation failed", { fields: fieldErrors });
  }
  const bodyParsed = parsed.data;
  const b = bodyParsed.billing;
  const addr = b.address;

  // Country is always required (for tax)
  const countryTrimmed = addr.countryCode?.trim() ?? "";
  if (!countryTrimmed || countryTrimmed.length !== 2) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", {
      fields: { billingCountryCode: "Please select your country." },
    });
  }

  if (isPostalCodeRequiredForCheckout(countryTrimmed) && !addr.postalCode?.trim()) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", {
      fields: { billingPostalCode: "Postal code is required for this country." },
    });
  }
  if (countryTrimmed === "US" && addr.postalCode?.trim() && !/^\d{5}$/.test(addr.postalCode.trim())) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", {
      fields: { billingPostalCode: "US ZIP code must be 5 digits." },
    });
  }

  // When any billing address field beyond country/postal is provided, require city, firstLine, and (per country) region
  const hasAnyBillingDetail =
    !!(addr.city?.trim() || addr.firstLine?.trim() || addr.region?.trim() || addr.secondLine?.trim());
  if (hasAnyBillingDetail) {
    const fieldErrors: Record<string, string> = {};
    if ((addr.city?.length ?? 0) > 120) fieldErrors.billingCity = "City must be 120 characters or less.";
    if ((addr.firstLine?.length ?? 0) > 200) fieldErrors.billingFirstLine = "Address line 1 must be 200 characters or less.";
    if ((addr.postalCode?.length ?? 0) > 20) fieldErrors.billingPostalCode = "Postal code must be 20 characters or less.";
    if ((addr.region?.length ?? 0) > 80) fieldErrors.billingRegion = "Region must be 80 characters or less.";
    if ((addr.secondLine?.length ?? 0) > 200) fieldErrors.billingSecondLine = "Address line 2 must be 200 characters or less.";
    if (Object.keys(fieldErrors).length > 0) {
      return ApiErrors.VALIDATION_ERROR("Validation failed", { fields: fieldErrors });
    }
  }

  const existingProfile = await prisma.billingProfile.findUnique({
    where: { tenantId },
    select: {
      contactName: true,
      contactEmail: true,
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

  function trimOrUndefined(s: string | null | undefined): string | undefined {
    const t = s?.trim();
    return t === "" ? undefined : t ?? undefined;
  }

  const contactName = bodyParsed.contact.name.trim();
  const contactEmail = bodyParsed.contact.email.trim();

  const updatePayload = {
    contactName,
    contactEmail,
    countryCode: trimOrUndefined(addr.countryCode) ?? null,
    postalCode: trimOrUndefined(addr.postalCode) ?? null,
    region: trimOrUndefined(addr.region) ?? null,
    city: trimOrUndefined(addr.city) ?? null,
    firstLine: trimOrUndefined(addr.firstLine) ?? null,
    secondLine: trimOrUndefined(addr.secondLine) ?? null,
    companyName: trimOrUndefined(b.companyName) ?? null,
    taxIdentifier: trimOrUndefined(b.taxIdentifier) ?? null,
    updatedByUserId: session.user.id,
  };

  const createPayload = {
    tenantId,
    contactName: updatePayload.contactName,
    contactEmail: updatePayload.contactEmail,
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
    contactName: updatePayload.contactName,
    contactEmail: updatePayload.contactEmail,
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

  const countryCode = (trimOrUndefined(addr.countryCode) ?? "").toUpperCase();
  const businessToggle = !!(b.businessToggle && b.companyName?.trim());

  // Pass all provided address fields (country always; postal/region/city/firstLine/secondLine optional)
  const billingAddressForPaddle = {
    countryCode,
    postalCode: trimOrUndefined(addr.postalCode) ?? undefined,
    region: trimOrUndefined(addr.region) ?? undefined,
    city: trimOrUndefined(addr.city) ?? undefined,
    firstLine: trimOrUndefined(addr.firstLine) ?? undefined,
    secondLine: trimOrUndefined(addr.secondLine) ?? undefined,
  };

  const business = b.companyName?.trim()
    ? {
        companyName: b.companyName.trim(),
        taxIdentifier: b.taxIdentifier?.trim() || null,
        countryCode: countryCode || "",
      }
    : undefined;

  try {
    const result = await createCheckoutSession({
      tenantId,
      planCode: bodyParsed.planCode,
      customerEmail: contactEmail,
      customerName: contactName,
      billingAddress: billingAddressForPaddle,
      business: business ?? undefined,
      skipTaxId: bodyParsed.skipTaxId,
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
      planCode: bodyParsed.planCode,
      country: countryCode ?? undefined,
      businessToggle,
    });

    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId,
      action: "tenant.billing.checkout_initiated",
      targetType: "Subscription",
      metadata: { planCode: bodyParsed.planCode },
    });

    // Append country_code so Paddle checkout shows the same country as our modal (and can default to Payment when address is set)
    const checkoutUrl = appendCountryToCheckoutUrl(result.checkoutUrl, countryCode);
    return apiSuccess({ checkoutUrl });
  } catch (err) {
    if (err instanceof TaxIdentifierValidationError) {
      logCheckoutFailedValidation({
        tenantId,
        planCode: bodyParsed.planCode,
        country: countryCode ?? undefined,
        businessToggle,
        reason: err.message,
      });
      return ApiErrors.TAX_IDENTIFIER_VALIDATION_FAILED(err.message);
    }
    throw err;
  }
});
