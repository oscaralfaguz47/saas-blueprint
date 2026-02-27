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
 * Default filter=completed: only completed/paid/billed with totalCents > 0 (excludes $0 payment-method-update).
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
          status: { in: ["completed", "paid", "billed"] },
          totalCents: { gt: 0 },
        }
      : {};

  let transactions = await prisma.billingTransaction.findMany({
    where: { tenantId, ...statusFilter },
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
        where: { tenantId, ...statusFilter },
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
    status: normalizeTransactionStatus(t.status),
    total: { cents: t.totalCents, currency: t.currency },
    invoiceUrl: t.invoiceUrl ?? undefined,
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
  return raw || "unknown";
}
