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

export type SubscriptionPaymentMethodDisplay = {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
};

function fromCardPayload(card: {
  type: string;
  last4: string;
  expiry_month: number;
  expiry_year: number;
}): SubscriptionPaymentMethodDisplay {
  return {
    brand: card.type,
    last4: card.last4,
    expiryMonth: card.expiry_month,
    expiryYear: card.expiry_year,
  };
}

/**
 * Get the payment method on file for a subscription (for display only: brand, last4, expiry).
 * 1) Tries listing the customer's saved payment methods and returns the first card.
 * 2) If none, falls back to the latest completed transaction for the subscription and fetches
 *    the payment method used (works when the customer did not "save" the card at checkout).
 * @see https://developer.paddle.com/api-reference/payment-methods/list-payment-methods
 * @see https://developer.paddle.com/api-reference/transactions/list-transactions
 * @see https://developer.paddle.com/api-reference/payment-methods/get-payment-method
 */
export async function getSubscriptionPaymentMethod(params: {
  providerCustomerId: string;
  providerSubscriptionId?: string | null;
}): Promise<SubscriptionPaymentMethodDisplay | null> {
  const { providerCustomerId, providerSubscriptionId } = params;

  // 1) Try saved payment methods for the customer
  const listRes = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/payment-methods?per_page=50`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (listRes.ok) {
    const listJson = (await listRes.json()) as {
      data?: Array<{
        type: string;
        card?: {
          type: string;
          last4: string;
          expiry_month: number;
          expiry_year: number;
        };
      }>;
    };
    const list = listJson?.data ?? [];
    const cardMethod = list.find(
      (m) => m.type === "card" && m.card?.last4 != null
    );
    if (cardMethod?.card) return fromCardPayload(cardMethod.card);
  }

  // 2) Fallback: get payment method from latest completed transaction for this subscription
  if (!providerSubscriptionId) return null;

  const txListRes = await fetch(
    `${PADDLE_API_BASE}/transactions?subscription_id=${encodeURIComponent(providerSubscriptionId)}&status=completed&order_by=created_at[DESC]&per_page=1`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!txListRes.ok) return null;
  const txListJson = (await txListRes.json()) as { data?: Array<{ id: string }> };
  const firstTx = txListJson?.data?.[0];
  if (!firstTx?.id) return null;

  const txRes = await fetch(
    `${PADDLE_API_BASE}/transactions/${encodeURIComponent(firstTx.id)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    }
  );
  if (!txRes.ok) return null;
  const txJson = (await txRes.json()) as {
    data?: {
      payments?: Array<{
        status: string;
        payment_method_id?: string | null;
        method_details?: {
          card?: {
            type?: string;
            last4?: string;
            expiry_month?: number;
            expiry_year?: number;
          };
        };
      }>;
    };
  };
  const payments = txJson?.data?.payments ?? [];
  const captured = payments.find((p) => p.status === "captured");
  const payment = captured ?? payments[0];
  if (!payment) return null;

  // Prefer card info from transaction payment method_details if present
  const methodCard = payment.method_details?.card;
  if (
    methodCard?.last4 != null &&
    methodCard.expiry_month != null &&
    methodCard.expiry_year != null
  ) {
    return fromCardPayload({
      type: methodCard.type ?? "card",
      last4: methodCard.last4,
      expiry_month: methodCard.expiry_month,
      expiry_year: methodCard.expiry_year,
    });
  }

  // Otherwise fetch the payment method by ID
  const paymentMethodId = payment.payment_method_id;
  if (!paymentMethodId) return null;

  const pmRes = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!pmRes.ok) return null;
  const pmJson = (await pmRes.json()) as {
    data?: {
      type?: string;
      card?: {
        type: string;
        last4: string;
        expiry_month: number;
        expiry_year: number;
      };
    };
  };
  const pmCard =
    pmJson?.data?.type === "card" ? pmJson?.data?.card : null;
  if (!pmCard?.last4) return null;
  return fromCardPayload(pmCard);
}
