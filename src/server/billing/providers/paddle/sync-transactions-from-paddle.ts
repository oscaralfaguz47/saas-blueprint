import "server-only";

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
 * Fetch all transactions for a Paddle customer and upsert into BillingTransaction.
 * Uses customer_id so we get every transaction (e.g. Starter then Pro) across subscriptions.
 * Used to backfill and to keep history when the user has upgraded/changed plans.
 */
export async function syncTransactionsFromPaddle(params: {
  tenantId: string;
  providerCustomerId: string;
}): Promise<{ synced: number }> {
  const { tenantId, providerCustomerId } = params;

  const url = new URL(`${PADDLE_API_BASE}/transactions`);
  url.searchParams.set("customer_id", providerCustomerId);
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
  if (list.length === 0) return { synced: 0 };

  let synced = 0;
  for (const txn of list) {
    const providerTransactionId = txn?.id?.trim();
    if (!providerTransactionId || providerTransactionId.length > 191) continue;

    const totals = txn?.details?.totals;
    const subtotalCents = parseAmount(totals?.subtotal);
    const taxCents = parseAmount(totals?.tax);
    const totalCents = parseAmount(totals?.total);
    const currency = (txn?.currency_code ?? "USD").slice(0, 10);
    const status = (txn?.status ?? "completed").slice(0, 40);
    const billedAt = parseDate(txn?.billed_at ?? txn?.created_at);
    const subId = txn?.subscription_id?.slice(0, 191) ?? null;
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
        providerSubscriptionId: subId,
      },
      update: {
        status,
        billedAt,
        subtotalCents,
        taxCents,
        totalCents,
        providerInvoiceId: providerInvoiceId ?? undefined,
        receiptNumber: receiptNumber ?? undefined,
        providerSubscriptionId: subId ?? undefined,
      },
    });
    synced += 1;
  }

  return { synced };
}
