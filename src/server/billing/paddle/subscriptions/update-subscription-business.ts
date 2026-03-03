import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

/**
 * PATCH subscription to set the business used for this subscription's invoices.
 * Paddle API: "Include [business_id] to change the business for a subscription."
 * No items or next_billed_at are sent, so proration_billing_mode is not required.
 */
export async function updateSubscriptionBusiness(
  providerSubscriptionId: string,
  businessId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getPaddleApiKey()}`,
        },
        body: JSON.stringify({ business_id: businessId.trim() }),
      }
    );
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
}
