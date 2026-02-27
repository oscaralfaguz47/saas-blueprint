import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { getInvoiceUrl } from "@/server/billing/paddle/invoices/get-invoice-url";
import { ApiErrors, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";

/**
 * GET /api/billing/transactions/[id]/invoice-redirect
 * Always opens the PDF invoice in a new tab: calls GET /transactions/{transaction_id}/invoice
 * and redirects to the returned URL. Uses sandbox when PADDLE_ENVIRONMENT !== "production".
 * Requires tenant.billing.manage.
 */
export const GET = withErrorHandler(
  async (
    req: Request,
    context: { params: Promise<{ id: string }> }
  ) => {
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

    const { id } = await context.params;
    const transaction = await prisma.billingTransaction.findFirst({
      where: { id, tenantId },
      select: { providerTransactionId: true, status: true, invoiceUrl: true },
    });
    if (!transaction?.providerTransactionId) {
      return ApiErrors.NOT_FOUND("Transaction");
    }
    if (transaction.status !== "completed" && transaction.status !== "billed") {
      return ApiErrors.VALIDATION_ERROR(
        "Invoice is only available for completed or billed transactions."
      );
    }

    let url: string | null = transaction.invoiceUrl ?? null;
    if (!url) {
      url = await getInvoiceUrl({
        providerTransactionId: transaction.providerTransactionId,
        tenantId,
        persist: true,
      });
    }
    if (!url) {
      return ApiErrors.INTERNAL_ERROR(
        "Paddle did not return an invoice URL. Try again or open the link from your receipt email."
      );
    }
    return NextResponse.redirect(url);
  }
);
