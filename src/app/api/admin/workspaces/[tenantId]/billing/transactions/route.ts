import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspaceDetailLimit } from "@/server/security/admin-rate-limit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const limitSchema = z.coerce.number().int().min(1).max(MAX_LIMIT);
const offsetSchema = z.coerce.number().int().min(0);

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<{ tenantId: string }> }) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.billing.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspaceDetailLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const { tenantId } = paramsSchema.parse(await context.params);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

  const url = new URL(req.url);
  const limit = limitSchema.safeParse(url.searchParams.get("limit")).success
    ? limitSchema.parse(url.searchParams.get("limit"))
    : DEFAULT_LIMIT;
  const offset = offsetSchema.safeParse(url.searchParams.get("offset")).success
    ? offsetSchema.parse(url.searchParams.get("offset"))
    : 0;

  let transactions = await prisma.billingTransaction.findMany({
    where: {
      tenantId,
      status: { in: ["completed", "paid", "billed", "failed", "past_due"] },
      totalCents: { gt: 0 },
    },
    orderBy: [{ billedAt: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    skip: offset,
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
