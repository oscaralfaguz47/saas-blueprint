import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

/**
 * EPIC 5: Schedule Paddle subscription to cancel at end of current billing period.
 * POST /subscriptions/{id}/cancel with default effective_from (next_billing_period).
 * Subscription remains active until period end.
 */
export async function cancelSubscriptionAtPeriodEnd(
  providerSubscriptionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getPaddleApiKey()}`,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ effective_from: "next_billing_period" }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `${res.status}: ${err}` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
}
