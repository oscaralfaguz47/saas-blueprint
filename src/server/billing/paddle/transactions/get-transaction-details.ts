import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

export type TransactionDetails = {
  transactionId: string;
  providerTransactionId: string;
  invoiceNumber: string | null;
  billedAt: string | null;
  totalCents: number;
  currency: string;
  status: string;
  revisedAt: string | null;
  /** Billing fields for the form (from transaction's customer/address/business). */
  fullName: string;
  companyName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
};

type PaddleCustomer = { name?: string | null };
type PaddleAddress = { first_line?: string | null; second_line?: string | null; city?: string | null; region?: string | null };
type PaddleBusiness = { name?: string | null; tax_identifier?: string | null };
type PaddleTransaction = {
  id: string;
  status?: string;
  billed_at?: string | null;
  invoice_number?: string | null;
  details?: { totals?: { total?: string } };
  currency_code?: string;
  revised_at?: string | null;
  customer?: PaddleCustomer | null;
  address?: PaddleAddress | null;
  business?: PaddleBusiness | null;
};

/**
 * Fetch a single transaction from Paddle with customer, address, and business included.
 * Used to prefill "Edit billing details" and to get invoice summary.
 */
export async function getTransactionDetails(providerTransactionId: string): Promise<TransactionDetails | null> {
  const url = new URL(`${PADDLE_API_BASE}/transactions/${encodeURIComponent(providerTransactionId)}`);
  url.searchParams.set("include", "customer,address,business");
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: PaddleTransaction };
  const t = json?.data;
  if (!t?.id) return null;

  // Paddle totals.total is string in lowest denomination (e.g. "2499" = $24.99)
  const totalCents = parseInt(String(t.details?.totals?.total ?? "0"), 10);
  const safeTotalCents = Number.isFinite(totalCents) ? totalCents : 0;
  const customer = t.customer;
  const address = t.address;
  const business = t.business;

  return {
    transactionId: t.id,
    providerTransactionId: t.id,
    invoiceNumber: t.invoice_number?.trim?.() ?? null,
    billedAt: t.billed_at ?? null,
    totalCents: safeTotalCents,
    currency: t.currency_code ?? "USD",
    status: t.status ?? "unknown",
    revisedAt: t.revised_at ?? null,
    fullName: customer?.name?.trim?.() ?? "",
    companyName: business?.name?.trim?.() ?? null,
    taxId: business?.tax_identifier?.trim?.() ?? null,
    addressLine1: address?.first_line?.trim?.() ?? null,
    addressLine2: address?.second_line?.trim?.() ?? null,
    city: address?.city?.trim?.() ?? null,
    region: address?.region?.trim?.() ?? null,
  };
}
