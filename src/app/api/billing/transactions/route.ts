import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { syncTransactionsFromPaddle } from "@/server/billing/providers/paddle/sync-transactions-from-paddle";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";

const DEFAULT_LIMIT = 50;

/**
 * GET /api/billing/transactions
 * Returns transaction history for the current tenant (last 50). Auth required; tenant-scoped.
 * If the tenant has a Paddle subscription but no local transactions, backfills from Paddle once.
 */
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

  let transactions = await prisma.billingTransaction.findMany({
    where: { tenantId },
    orderBy: [{ billedAt: "desc" }, { createdAt: "desc" }],
    take: DEFAULT_LIMIT,
    select: {
      id: true,
      billedAt: true,
      status: true,
      currency: true,
      totalCents: true,
      invoiceUrl: true,
    },
  });

  // Sync from Paddle by customer so we have all transactions (Starter + Pro + any plan changes)
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, provider: "paddle" },
    select: { providerCustomerId: true },
  });
  if (subscription?.providerCustomerId) {
    try {
      await syncTransactionsFromPaddle({
        tenantId,
        providerCustomerId: subscription.providerCustomerId,
      });
      transactions = await prisma.billingTransaction.findMany({
        where: { tenantId },
        orderBy: [{ billedAt: "desc" }, { createdAt: "desc" }],
        take: DEFAULT_LIMIT,
        select: {
          id: true,
          billedAt: true,
          status: true,
          currency: true,
          totalCents: true,
          invoiceUrl: true,
        },
      });
    } catch {
      // Ignore sync errors (e.g. API key, network); keep existing list
    }
  }

  const list = transactions.map((t) => ({
    id: t.id,
    billedAt: t.billedAt?.toISOString() ?? t.id,
    status: t.status,
    total: { cents: t.totalCents, currency: t.currency },
    invoiceUrl: t.invoiceUrl ?? undefined,
  }));

  return apiSuccess({ transactions: list });
});
