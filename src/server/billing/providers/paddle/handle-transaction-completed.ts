import "server-only";

import { prisma } from "@/server/db";
import { logWebhookReceived } from "@/server/billing/billing-log";
import { parseMetadataFromCustomData } from "./map-paddle-event";
import { paddleWebhookEnvelopeSchema } from "./paddle-types";

/** Paddle transaction.completed data shape (minimal fields we use). */
type TransactionData = {
  id?: string;
  status?: string;
  currency_code?: string;
  subscription_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  custom_data?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  billed_at?: string | null;
  details?: {
    totals?: {
      subtotal?: string;
      tax?: string;
      total?: string;
    };
  };
  checkout?: { url?: string } | null;
};

function parseAmount(s: string | undefined | null): number {
  if (s == null || s === "") return 0;
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s: string | undefined | null): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Handle transaction.completed webhook: idempotent upsert BillingTransaction and create BillingEvent.
 * Tenant from custom_data only; no PII stored.
 */
export async function handleTransactionCompleted(envelope: unknown): Promise<{
  processed: boolean;
  ignored?: boolean;
}> {
  const parsed = paddleWebhookEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) return { processed: false };
  const { event_id: eventId, event_type: eventType, data } = parsed.data;
  const txn = data as TransactionData;

  const providerTransactionId = txn?.id?.trim();
  if (!providerTransactionId || providerTransactionId.length > 191) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false, ignored: true };
  }

  const customData = txn?.custom_data;
  const metadata = parseMetadataFromCustomData(
    customData && typeof customData === "object" ? customData : undefined
  );
  if (!metadata) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false, ignored: true };
  }

  const tenantId = metadata.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true },
  });
  if (!tenant) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      extractedTenantId: tenantId,
      result: "ignored",
    });
    return { processed: false, ignored: true };
  }
  if (tenant.status !== "ACTIVE" && tenant.status !== "SUSPENDED") {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      extractedTenantId: tenantId,
      result: "ignored",
    });
    return { processed: false, ignored: true };
  }

  const totals = txn?.details?.totals;
  const subtotalCents = parseAmount(totals?.subtotal);
  const taxCents = parseAmount(totals?.tax);
  const totalCents = parseAmount(totals?.total);
  const currency = (txn?.currency_code ?? "USD").slice(0, 10);
  const status = (txn?.status ?? "completed").slice(0, 40);
  const billedAt = parseDate(txn?.billed_at ?? txn?.created_at);
  const providerSubscriptionId = txn?.subscription_id?.slice(0, 191) ?? null;
  const receiptNumber = txn?.invoice_number?.slice(0, 120) ?? null;
  const planCode = metadata.planCode?.slice(0, 50) ?? null;
  // Store only Paddle invoice_id (inv_xxx). "Open" uses GET /invoices/{invoice_id} → hosted_invoice_url (n8n-style).
  const providerInvoiceId =
    typeof txn?.invoice_id === "string" && txn.invoice_id.trim().length > 0 && txn.invoice_id.length <= 191
      ? txn.invoice_id.trim()
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.billingTransaction.upsert({
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
        planCode,
        providerSubscriptionId,
      },
      update: {
        status,
        billedAt,
        subtotalCents,
        taxCents,
        totalCents,
        providerInvoiceId: providerInvoiceId ?? undefined,
        receiptNumber: receiptNumber ?? undefined,
        providerSubscriptionId: providerSubscriptionId ?? undefined,
      },
    });
  });

  logWebhookReceived({
    eventType,
    providerEventId: eventId,
    extractedTenantId: tenantId,
    extractedPlanCode: planCode ?? undefined,
    result: "success",
  });

  return { processed: true };
}
