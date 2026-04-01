import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";
import { prisma } from "@/server/db";

/**
 * EPIC 5: Fetch invoice URL from Paddle for a transaction. Optionally persist to BillingTransaction.
 */
export async function getInvoiceUrl(params: {
  providerTransactionId: string;
  tenantId: string;
  persist?: boolean;
}): Promise<string | null> {
  const { providerTransactionId, tenantId, persist = false } = params;
  const url = new URL(
    `${PADDLE_API_BASE}/transactions/${providerTransactionId}/invoice`
  );
  url.searchParams.set("disposition", "inline");
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { url?: string } };
  const invoiceUrl = json?.data?.url;
  if (typeof invoiceUrl !== "string") return null;

  if (persist && invoiceUrl.length <= 600) {
    // BillingTransaction.invoiceUrl is VarChar(600); skip persisting when longer so we don't store a broken truncated URL.
    await prisma.billingTransaction.updateMany({
      where: { tenantId, providerTransactionId },
      data: { invoiceUrl: invoiceUrl },
    });
  }
  return invoiceUrl;
}
