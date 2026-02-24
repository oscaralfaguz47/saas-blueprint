import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";

const billingProfileSchema = z.object({
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(191).optional().nullable(),
  countryCode: z.string().length(2).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  firstLine: z.string().max(200).optional().nullable(),
  secondLine: z.string().max(200).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  taxIdentifier: z.string().max(80).optional().nullable(),
});

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

  const profile = await prisma.billingProfile.findUnique({
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
      countryMismatch: true,
    },
  });

  return apiSuccess(profile ?? null);
});

export const PATCH = withErrorHandler(async (req: Request) => {
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

  const body = await parseBody(req, billingProfileSchema);

  const profile = await prisma.billingProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      contactName: (body.contactName?.trim() || undefined) ?? undefined,
      contactEmail: (body.contactEmail?.trim() || undefined) ?? undefined,
      countryCode: body.countryCode ?? undefined,
      postalCode: (body.postalCode?.trim() || undefined) ?? undefined,
      region: (body.region?.trim() || undefined) ?? undefined,
      city: (body.city?.trim() || undefined) ?? undefined,
      firstLine: (body.firstLine?.trim() || undefined) ?? undefined,
      secondLine: (body.secondLine?.trim() || undefined) ?? undefined,
      companyName: (body.companyName?.trim() || undefined) ?? undefined,
      taxIdentifier: (body.taxIdentifier?.trim() || undefined) ?? undefined,
      updatedByUserId: session.user.id,
    },
    update: {
      ...(body.contactName !== undefined && { contactName: (body.contactName?.trim() || undefined) ?? null }),
      ...(body.contactEmail !== undefined && { contactEmail: (body.contactEmail?.trim() || undefined) ?? null }),
      ...(body.countryCode !== undefined && { countryCode: body.countryCode ?? null }),
      ...(body.postalCode !== undefined && { postalCode: (body.postalCode?.trim() || undefined) ?? null }),
      ...(body.region !== undefined && { region: (body.region?.trim() || undefined) ?? null }),
      ...(body.city !== undefined && { city: (body.city?.trim() || undefined) ?? null }),
      ...(body.firstLine !== undefined && { firstLine: (body.firstLine?.trim() || undefined) ?? null }),
      ...(body.secondLine !== undefined && { secondLine: (body.secondLine?.trim() || undefined) ?? null }),
      ...(body.companyName !== undefined && { companyName: (body.companyName?.trim() || undefined) ?? null }),
      ...(body.taxIdentifier !== undefined && { taxIdentifier: (body.taxIdentifier?.trim() || undefined) ?? null }),
      updatedByUserId: session.user.id,
    },
    select: {
      id: true,
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

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.profile_updated",
    targetType: "BillingProfile",
    targetId: profile.id,
    metadata: { updated: true },
  });

  return apiSuccess(profile);
});
