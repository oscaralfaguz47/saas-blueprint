import "server-only";

import { env } from "@/lib/env";

const PADDLE_API_BASE =
  env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const key = env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}

/**
 * Get a transaction to update payment method for a subscription.
 * GET /subscriptions/{subscription_id}/update-payment-method-transaction
 * - past_due: returns the most recent past_due transaction
 * - active: creates a new zero-amount transaction (origin: subscription_payment_method_change)
 * Pass the returned transaction ID to Paddle.Checkout.open() with displayMode: "overlay" for in-app modal.
 * @see https://developer.paddle.com/api-reference/subscriptions/update-payment-method
 * @see https://developer.paddle.com/build/subscriptions/update-payment-details
 */
export async function getUpdatePaymentMethodTransaction(params: {
  providerSubscriptionId: string;
}): Promise<{ transactionId: string }> {
  const { providerSubscriptionId } = params;
  const res = await fetch(
    `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(providerSubscriptionId)}/update-payment-method-transaction`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `Paddle Get Update Payment Method Transaction failed: ${res.status} ${err}`
    );
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const transactionId = json?.data?.id;
  if (!transactionId || typeof transactionId !== "string") {
    throw new Error(
      "Paddle Get Update Payment Method Transaction: missing data.id in response"
    );
  }
  return { transactionId };
}
