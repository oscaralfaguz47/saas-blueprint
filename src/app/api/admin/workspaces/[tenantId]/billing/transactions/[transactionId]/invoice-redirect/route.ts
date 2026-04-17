import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspaceDetailLimit } from "@/server/security/admin-rate-limit";
import { getInvoiceUrl } from "@/server/billing/paddle/invoices/get-invoice-url";
import { ApiErrors, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { z } from "zod";

const paramsSchema = z.object({
  tenantId: z.string().cuid(),
  transactionId: z.string().cuid(),
});

/**
 * GET /api/admin/workspaces/[tenantId]/billing/transactions/[transactionId]/invoice-redirect
 * Platform admin read-only: opens invoice PDF URL for a tenant transaction (same behavior as tenant route, scoped by URL tenantId).
 */
export const GET = withErrorHandler(
  async (_req: Request, context: { params: Promise<{ tenantId: string; transactionId: string }> }) => {
    const session = await getServerSession(authOptions);
    const authError = await requireAdminAuth(session, "admin.billing.read");
    if (authError) return authError;
    if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

    const rl = await checkAdminWorkspaceDetailLimit(session.user.id);
    if (!rl.allowed)
      return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
        retryAfterSeconds: rl.retryAfterSeconds,
      });

    const { tenantId, transactionId } = paramsSchema.parse(await context.params);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

    const transaction = await prisma.billingTransaction.findFirst({
      where: { id: transactionId, tenantId },
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
        "Paddle did not return an invoice URL. Try again or open the link from the customer receipt email."
      );
    }
    return NextResponse.redirect(url);
  }
);
