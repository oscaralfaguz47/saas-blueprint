import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { requireFullSession } from "@/server/require-full-session";
import { syncTransactionsFromPaddle } from "@/server/billing/providers/paddle/sync-transactions-from-paddle";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { z } from "zod";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const filterSchema = z.enum(["completed", "all"]);
const limitSchema = z.coerce.number().int().min(1).max(MAX_LIMIT);
const offsetSchema = z.coerce.number().int().min(0);

/**
 * GET /api/billing/transactions?filter=completed|all&limit=20&offset=0
 * Paginated. Default filter=completed; limit=20, offset=0.
 * Returns { transactions, hasMore } for infinite scroll / load-more.
 */
export const GET = withErrorHandler(async (req: Request) => {
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

  const url = new URL(req.url);
  const filterParam = url.searchParams.get("filter") ?? "completed";
  const filter = filterSchema.safeParse(filterParam).success ? filterParam : "completed";
  const limit = limitSchema.safeParse(url.searchParams.get("limit")).success
    ? limitSchema.parse(url.searchParams.get("limit"))
    : DEFAULT_LIMIT;
  const offset = offsetSchema.safeParse(url.searchParams.get("offset")).success
    ? offsetSchema.parse(url.searchParams.get("offset"))
    : 0;

  const statusFilter: { status?: { in: string[] }; totalCents?: { gt: number } } =
    filter === "completed"
      ? {
          status: { in: ["completed", "paid", "billed", "failed", "past_due"] },
          totalCents: { gt: 0 },
        }
      : {};

  const where = { tenantId, ...statusFilter };
  const orderBy = [{ billedAt: "desc" as const }, { createdAt: "desc" as const }];
  const select = {
    id: true,
    providerTransactionId: true,
    billedAt: true,
    status: true,
    currency: true,
    totalCents: true,
    invoiceUrl: true,
    receiptNumber: true,
    revisedAt: true,
  };

  // Sync from Paddle once (on first page) so list is fresh before we paginate
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId, provider: "paddle" },
    select: { providerSubscriptionId: true },
  });
  const providerSubscriptionIds = subscriptions
    .map((s) => s.providerSubscriptionId)
    .filter((id): id is string => Boolean(id));
  if (providerSubscriptionIds.length > 0 && offset === 0) {
    try {
      await syncTransactionsFromPaddle({
        tenantId,
        providerSubscriptionIds,
      });
    } catch {
      // Ignore sync errors; keep existing list
    }
  }

  let transactions = await prisma.billingTransaction.findMany({
    where,
    orderBy,
    take: limit + 1,
    skip: offset,
    select,
  });

  const hasMore = transactions.length > limit;
  if (hasMore) transactions = transactions.slice(0, limit);

  const list = transactions.map((t) => ({
    id: t.id,
    providerTransactionId: t.providerTransactionId ?? undefined,
    billedAt: t.billedAt?.toISOString() ?? t.id,
    status: normalizeTransactionStatus(t.status),
    total: { cents: t.totalCents, currency: t.currency },
    invoiceUrl: t.invoiceUrl ?? undefined,
    receiptNumber: t.receiptNumber ?? undefined,
    isRevised: t.revisedAt != null,
  }));

  return apiSuccess({ transactions: list, hasMore });
});

function normalizeTransactionStatus(raw: string): string {
  const s = raw?.toLowerCase() ?? "";
  if (["paid", "completed", "billed"].includes(s)) return "completed";
  if (s === "ready") return "ready";
  if (s === "draft") return "draft";
  if (["canceled", "cancelled"].includes(s)) return "canceled";
  if (s === "failed") return "failed";
  if (s === "past_due") return "past_due";
  return raw || "unknown";
}
