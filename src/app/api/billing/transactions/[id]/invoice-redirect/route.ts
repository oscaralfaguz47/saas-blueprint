import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";

const PADDLE_API_BASE =
  process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}

/**
 * GET /api/billing/transactions/[id]/invoice-redirect
 * Always opens the PDF invoice in a new tab: calls GET /transactions/{transaction_id}/invoice
 * and redirects to the returned URL. Uses sandbox when PADDLE_ENVIRONMENT !== "production".
 * Requires tenant.billing.manage.
 */
export const GET = withErrorHandler(
  async (
    _req: Request,
    context: { params: Promise<{ id: string }> }
  ) => {
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

    const { id } = await context.params;
    const transaction = await prisma.billingTransaction.findFirst({
      where: { id, tenantId },
      select: { providerTransactionId: true, status: true },
    });
    if (!transaction?.providerTransactionId) {
      return ApiErrors.NOT_FOUND("Transaction");
    }
    if (transaction.status !== "completed" && transaction.status !== "billed") {
      return ApiErrors.VALIDATION_ERROR(
        "Invoice is only available for completed or billed transactions."
      );
    }

    const txInvoiceUrl = new URL(
      `${PADDLE_API_BASE}/transactions/${transaction.providerTransactionId}/invoice`
    );
    txInvoiceUrl.searchParams.set("disposition", "inline");
    const res = await fetch(txInvoiceUrl.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    if (!res.ok) {
      const err = await res.text();
      return ApiErrors.INTERNAL_ERROR(
        `Failed to get invoice from Paddle: ${res.status} ${err}`
      );
    }
    const json = (await res.json()) as { data?: { url?: string } };
    const url = json?.data?.url;
    if (!url || typeof url !== "string") {
      return ApiErrors.INTERNAL_ERROR(
        "Paddle did not return an invoice URL. Try again or open the link from your receipt email."
      );
    }
    return NextResponse.redirect(url);
  }
);
