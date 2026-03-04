import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { getTransactionDetails } from "@/server/billing/paddle/transactions/get-transaction-details";

/**
 * GET /api/billing/paddle/transactions/[id]
 * Returns transaction details for "Edit billing details" modal: invoice summary + current billing fields + isRevised.
 * [id] = our BillingTransaction.id (cuid). Transaction must belong to current tenant.
 */
export const GET = withErrorHandler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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
    select: { id: true, providerTransactionId: true, revisedAt: true, receiptNumber: true },
  });
  if (!tx) return ApiErrors.NOT_FOUND("Transaction");

  const details = await getTransactionDetails(tx.providerTransactionId);
  if (!details) return ApiErrors.NOT_FOUND("Transaction details");

  return apiSuccess({
    transactionId: tx.id,
    invoiceNumber: details.invoiceNumber ?? tx.receiptNumber ?? null,
    billedAt: details.billedAt,
    totalCents: details.totalCents,
    currency: details.currency,
    status: details.status,
    isRevised: tx.revisedAt != null,
    fullName: details.fullName,
    companyName: details.companyName,
    taxId: details.taxId,
    addressLine1: details.addressLine1,
    addressLine2: details.addressLine2,
    city: details.city,
    region: details.region,
  });
});
