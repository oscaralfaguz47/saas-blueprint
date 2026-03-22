import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/server/db";

const PADDLE_API_BASE =
  env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const key = env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}

function parseAmount(s: string | number | undefined | null): number {
  if (s == null) return 0;
  const n = typeof s === "number" ? s : parseInt(String(s), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s: string | undefined | null): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

type PaddleTransactionItem = {
  id?: string;
  status?: string;
  currency_code?: string;
  subscription_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  billed_at?: string | null;
  created_at?: string | null;
  details?: {
    totals?: {
      subtotal?: string;
      tax?: string;
      total?: string;
    };
  };
  checkout?: { url?: string } | null;
};

/**
 * Fetch transactions for this tenant's Paddle subscription(s) and upsert into BillingTransaction.
 * Uses subscription_id filter so we only ever pull transactions for this tenant's subscription(s),
 * never other tenants' (same Paddle customer can have multiple subscriptions across workspaces).
 */
export async function syncTransactionsFromPaddle(params: {
  tenantId: string;
  /** This tenant's Paddle subscription ID(s). We fetch only these subscriptions' transactions. */
  providerSubscriptionIds: string[];
}): Promise<{ synced: number }> {
  const { tenantId, providerSubscriptionIds } = params;
  const subscriptionIds = providerSubscriptionIds.map((id) => id?.trim()).filter(Boolean);
  if (subscriptionIds.length === 0) return { synced: 0 };

  const subscriptionIdSet = new Set(subscriptionIds);
  const seenTransactionIds = new Set<string>();
  let synced = 0;

  for (const subId of subscriptionIds) {
    const url = new URL(`${PADDLE_API_BASE}/transactions`);
    url.searchParams.set("subscription_id", subId);
    url.searchParams.set("per_page", "30");
    url.searchParams.set("order_by", "billed_at[DESC]");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Paddle List Transactions failed: ${res.status} ${err}`);
    }

    const json = (await res.json()) as { data?: PaddleTransactionItem[] };
    const list = json?.data ?? [];

    for (const txn of list) {
      const providerTransactionId = txn?.id?.trim();
      if (!providerTransactionId || providerTransactionId.length > 191) continue;
      if (seenTransactionIds.has(providerTransactionId)) continue;
      seenTransactionIds.add(providerTransactionId);

      const txnSubId = txn?.subscription_id?.slice(0, 191) ?? null;
      if (!txnSubId || !subscriptionIdSet.has(txnSubId)) continue;

      const totals = txn?.details?.totals;
      const subtotalCents = parseAmount(totals?.subtotal);
      const taxCents = parseAmount(totals?.tax);
      const totalCents = parseAmount(totals?.total);
      const currency = (txn?.currency_code ?? "USD").slice(0, 10);
      const status = (txn?.status ?? "completed").slice(0, 40);
      const billedAt = parseDate(txn?.billed_at ?? txn?.created_at);
      const receiptNumber = txn?.invoice_number?.slice(0, 120) ?? null;
      const providerInvoiceId =
        typeof txn?.invoice_id === "string" && txn.invoice_id.trim().length > 0 && txn.invoice_id.length <= 191
          ? txn.invoice_id.trim()
          : null;

      await prisma.billingTransaction.upsert({
        where: { providerTransactionId },
        create: {
          tenantId,
          provider: "paddle",
          providerTransactionId,
          status,
          billedAt,
          currency,
          subtotalCents,
          taxCents,
          totalCents,
          providerInvoiceId,
          receiptNumber,
          planCode: null,
          providerSubscriptionId: txnSubId,
        },
        update: {
          status,
          billedAt,
          subtotalCents,
          taxCents,
          totalCents,
          providerInvoiceId: providerInvoiceId ?? undefined,
          receiptNumber: receiptNumber ?? undefined,
          providerSubscriptionId: txnSubId ?? undefined,
        },
      });
      synced += 1;
    }
  }

  return { synced };
}
