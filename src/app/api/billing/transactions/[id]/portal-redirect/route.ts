import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { getCustomerPortalLink } from "@/server/billing/providers/paddle/get-customer-portal-link";

/**
 * GET /api/billing/transactions/[id]/portal-redirect
 * Creates a Paddle customer portal session and redirects to the payment details page for
 * this transaction: {portal_origin}/payments/{transaction_id}/{cpl_id}?{token}
 * The cpl_id (Customer Portal Session Link ID) is taken from the overview URL path (e.g. cpl_01xxx).
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
    if (!transaction?.providerTransactionId) return ApiErrors.NOT_FOUND("Transaction");
    if (transaction.status !== "completed" && transaction.status !== "billed") {
      return ApiErrors.VALIDATION_ERROR(
        "Portal is only available for completed or billed transactions."
      );
    }

    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, provider: "paddle" },
      select: { providerCustomerId: true },
    });
    if (!subscription?.providerCustomerId) {
      return ApiErrors.VALIDATION_ERROR(
        "No Paddle subscription found for this workspace."
      );
    }

    let overviewUrl: string;
    try {
      const link = await getCustomerPortalLink({
        providerCustomerId: subscription.providerCustomerId,
      });
      overviewUrl = link.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create portal link";
      return ApiErrors.INTERNAL_ERROR(`Paddle portal: ${msg}`);
    }

    const overview = new URL(overviewUrl);
    const pathSegment = overview.pathname.replace(/^\/+/, "").split("/")[0];
    if (!pathSegment || !pathSegment.startsWith("cpl_")) {
      return NextResponse.redirect(overviewUrl);
    }
    const query = overview.searchParams.toString();
    const paymentDetailsUrl = query
      ? `${overview.origin}/payments/${transaction.providerTransactionId}/${pathSegment}?${query}`
      : `${overview.origin}/payments/${transaction.providerTransactionId}/${pathSegment}`;
    return NextResponse.redirect(paymentDetailsUrl);
  }
);
