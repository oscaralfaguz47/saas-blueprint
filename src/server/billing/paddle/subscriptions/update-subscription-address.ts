import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

/**
 * PATCH subscription to set the billing address used for this subscription's invoices.
 * Paddle API: "Include [address_id] to change the address for a subscription."
 * No items or next_billed_at are sent, so proration_billing_mode is not required.
 */
export async function updateSubscriptionAddress(
  providerSubscriptionId: string,
  addressId: string
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
        body: JSON.stringify({ address_id: addressId.trim() }),
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
