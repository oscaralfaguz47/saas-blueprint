/**
 * Safe, non-PII logging for billing (checkout, webhook).
 * Do NOT log: emails, names, full payloads, secrets, checkout URLs.
 */

export function logCheckoutInitiated(params: {
  tenantId: string;
  planCode: string;
}): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("[billing] checkout_initiated", {
      tenantId: params.tenantId,
      planCode: params.planCode,
    });
  }
}

export type WebhookLogResult =
  | "success"
  | "ignored"
  | "validation_error"
  | "signature_invalid"
  | "tenant_mismatch"
  | "process_failure";

export function logWebhookReceived(params: {
  eventType: string;
  providerEventId: string;
  providerSubscriptionId?: string | null;
  extractedTenantId?: string | null;
  extractedPlanCode?: string | null;
  result: WebhookLogResult;
}): void {
  const payload = {
    eventType: params.eventType,
    providerEventId: params.providerEventId,
    ...(params.providerSubscriptionId != null && {
      providerSubscriptionId: params.providerSubscriptionId,
    }),
    ...(params.extractedTenantId != null && {
      extractedTenantId: params.extractedTenantId,
    }),
    ...(params.extractedPlanCode != null && {
      extractedPlanCode: params.extractedPlanCode,
    }),
    result: params.result,
  };
  // Always log webhook outcome (no PII) so Vercel logs show success/failure branch
  // eslint-disable-next-line no-console
  console.info("[billing] webhook_received", payload);
}
