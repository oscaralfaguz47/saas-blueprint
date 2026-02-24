import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";

const DEFAULT_LIMIT = 50;

/**
 * GET /api/billing/transactions
 * Returns transaction history for the current tenant (last 50). Auth required; tenant-scoped.
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenant?.id;
  if (!tenantId) return ApiErrors.NO_TENANT();

  const transactions = await prisma.billingTransaction.findMany({
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

  const list = transactions.map((t) => ({
    id: t.id,
    billedAt: t.billedAt?.toISOString() ?? t.id,
    status: t.status,
    total: { cents: t.totalCents, currency: t.currency },
    invoiceUrl: t.invoiceUrl ?? undefined,
  }));

  return apiSuccess({ transactions: list });
});
