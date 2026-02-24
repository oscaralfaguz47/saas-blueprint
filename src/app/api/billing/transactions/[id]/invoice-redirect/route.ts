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
 * Resolves the transaction to Paddle and redirects to the temporary invoice PDF URL.
 * Requires tenant.billing.manage. Opens in new tab; link expires in 1 hour (Paddle).
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

    const url = new URL(
      `${PADDLE_API_BASE}/transactions/${transaction.providerTransactionId}/invoice`
    );
    url.searchParams.set("disposition", "inline");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    if (!res.ok) {
      const err = await res.text();
      return ApiErrors.INTERNAL_ERROR(
        `Failed to get invoice URL from Paddle: ${res.status} ${err}`
      );
    }

    const json = (await res.json()) as { data?: { url?: string } };
    const invoiceUrl = json?.data?.url;
    if (!invoiceUrl || typeof invoiceUrl !== "string") {
      return ApiErrors.INTERNAL_ERROR("Paddle did not return an invoice URL.");
    }

    return new Response(null, {
      status: 302,
      headers: { Location: invoiceUrl },
    });
  }
);
