import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { requireFullSession } from "@/server/require-full-session";
import { syncTransactionsFromPaddle } from "@/server/billing/providers/paddle/sync-transactions-from-paddle";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { z } from "zod";

const DEFAULT_LIMIT = 50;
const filterSchema = z.enum(["completed", "all"]);

/**
 * GET /api/billing/transactions?filter=completed|all
 * Default filter=completed: completed/paid/billed plus failed/past_due (payable), totalCents > 0.
 * Excludes ready/draft. providerTransactionId returned so client can open Paddle Checkout for past_due/failed.
 * filter=all: show ready/draft/incomplete/$0 etc.
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

  const statusFilter: { status?: { in: string[] }; totalCents?: { gt: number } } =
    filter === "completed"
      ? {
          status: { in: ["completed", "paid", "billed", "failed", "past_due"] },
          totalCents: { gt: 0 },
        }
      : {};

  let transactions = await prisma.billingTransaction.findMany({
    where: { tenantId, ...statusFilter },
    orderBy: [{ billedAt: "desc" }, { createdAt: "desc" }],
    take: DEFAULT_LIMIT,
    select: {
      id: true,
      providerTransactionId: true,
      billedAt: true,
      status: true,
      currency: true,
      totalCents: true,
      invoiceUrl: true,
      receiptNumber: true,
      revisedAt: true,
    },
  });

  // Sync from Paddle by subscription_id only (never by customer_id) so we never pull other tenants' transactions
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId, provider: "paddle" },
    select: { providerSubscriptionId: true },
  });
  const providerSubscriptionIds = subscriptions
    .map((s) => s.providerSubscriptionId)
    .filter((id): id is string => Boolean(id));
  if (providerSubscriptionIds.length > 0) {
    try {
      await syncTransactionsFromPaddle({
        tenantId,
        providerSubscriptionIds,
      });
      transactions = await prisma.billingTransaction.findMany({
        where: { tenantId, ...statusFilter },
        orderBy: [{ billedAt: "desc" }, { createdAt: "desc" }],
        take: DEFAULT_LIMIT,
        select: {
          id: true,
          providerTransactionId: true,
          billedAt: true,
          status: true,
          currency: true,
          totalCents: true,
          invoiceUrl: true,
          receiptNumber: true,
          revisedAt: true,
        },
      });
    } catch {
      // Ignore sync errors (e.g. API key, network); keep existing list
    }
  }

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

  return apiSuccess({ transactions: list });
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
