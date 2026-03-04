import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { reviseTransactionBillingDetails } from "@/server/billing/paddle/transactions/revise-transaction-billing-details";
import { z } from "zod";

const reviseBodySchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  companyName: z.string().max(255).nullable().optional(),
  taxId: z.string().max(64).nullable().optional(),
  addressLine1: z.string().max(255).nullable().optional(),
  addressLine2: z.string().max(255).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  region: z.string().max(255).nullable().optional(),
  cityAlreadyPresent: z.boolean().optional(),
  regionAlreadyPresent: z.boolean().optional(),
});

/**
 * POST /api/billing/paddle/transactions/[id]/revise
 * Revise billing details for this invoice only (Paddle: revise transaction customer details).
 * [id] = our BillingTransaction.id. Allowed only once per transaction; returns 409 if already revised.
 */
export const POST = withErrorHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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

  const { id } = await params;
  if (!id) return ApiErrors.VALIDATION_ERROR("Transaction ID required");

  const tx = await prisma.billingTransaction.findFirst({
    where: { id, tenantId, provider: "paddle" },
    select: { id: true, providerTransactionId: true, revisedAt: true, status: true },
  });
  if (!tx) return ApiErrors.NOT_FOUND("Transaction");
  if (tx.revisedAt != null) {
    return ApiErrors.CONFLICT("This invoice has already been revised. Billing details can only be edited once.");
  }
  const statusLower = tx.status?.toLowerCase();
  if (statusLower !== "completed" && statusLower !== "billed" && statusLower !== "paid") {
    return ApiErrors.VALIDATION_ERROR("Only completed or billed invoices can be revised.");
  }

  let body: z.infer<typeof reviseBodySchema>;
  try {
    const raw = await req.json();
    body = reviseBodySchema.parse(raw);
  } catch (e) {
    const message = e instanceof z.ZodError ? e.errors.map((x) => x.message).join("; ") : "Invalid request body";
    return ApiErrors.VALIDATION_ERROR(message, e instanceof z.ZodError ? { fieldErrors: e.flatten().fieldErrors } : undefined);
  }

  const result = await reviseTransactionBillingDetails(tx.providerTransactionId, {
    fullName: body.fullName,
    companyName: body.companyName ?? null,
    taxId: body.taxId ?? null,
    addressLine1: body.addressLine1 ?? null,
    addressLine2: body.addressLine2 ?? null,
    city: body.city ?? null,
    region: body.region ?? null,
    cityAlreadyPresent: body.cityAlreadyPresent,
    regionAlreadyPresent: body.regionAlreadyPresent,
  });

  if (!result.ok) {
    return ApiErrors.VALIDATION_ERROR(result.message ?? "Validation failed", {
      fieldErrors: result.fieldErrors,
    });
  }

  await prisma.billingTransaction.update({
    where: { id: tx.id },
    data: {
      revisedAt: new Date(),
      revisedByUserId: session.user.id,
      revisionRequestPayload: body as unknown as object,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.transaction_billing_revised",
    targetType: "BillingTransaction",
    targetId: tx.id,
    metadata: { providerTransactionId: tx.providerTransactionId },
  });

  return apiSuccess({ revised: true });
});
