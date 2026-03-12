/**
 * Safe, non-PII logging for billing (checkout, webhook).
 * Do NOT log: emails, names, full payloads, secrets, checkout URLs.
 */

export function logCheckoutInitiated(params: {
  tenantId: string;
  planCode: string;
  country?: string | null;
  businessToggle?: boolean;
}): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("[billing] checkout_initiated", {
      tenantId: params.tenantId,
      planCode: params.planCode,
      ...(params.country != null && { country: params.country }),
      ...(params.businessToggle != null && { businessToggle: params.businessToggle }),
    });
  }
}

export function logCheckoutFailedValidation(params: {
  tenantId: string;
  planCode: string;
  country?: string | null;
  businessToggle?: boolean;
  reason?: string;
}): void {
  // eslint-disable-next-line no-console
  console.info("[billing] checkout_failed_validation", {
    tenantId: params.tenantId,
    planCode: params.planCode,
    ...(params.country != null && { country: params.country }),
    ...(params.businessToggle != null && { businessToggle: params.businessToggle }),
    ...(params.reason != null && { reason: params.reason }),
  });
}

export type WebhookLogResult =
  | "success"
  | "ignored"
  | "validation_error"
  | "signature_invalid"
  | "tenant_mismatch"
  | "tenant_customer_mismatch"
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
