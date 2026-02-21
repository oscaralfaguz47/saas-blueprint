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

export function logWebhookReceived(params: {
  eventType: string;
  providerEventId: string;
  providerSubscriptionId?: string | null;
  extractedTenantId?: string | null;
  extractedPlanCode?: string | null;
  result: "success" | "ignored" | "validation_error" | "signature_invalid" | "tenant_mismatch";
}): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("[billing] webhook_received", {
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
    });
  }
}
