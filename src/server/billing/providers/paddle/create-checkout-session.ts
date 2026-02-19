import "server-only";

import { prisma } from "@/server/db";
import type { PlanCode } from "@/server/billing/provider-types";

const PADDLE_API_BASE =
  process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}

function getPriceId(planCode: PlanCode): string {
  if (planCode === "free") throw new Error("Cannot checkout free plan");
  const envKey =
    planCode === "starter" ? "PADDLE_PRICE_ID_STARTER" : "PADDLE_PRICE_ID_PRO";
  const id = process.env[envKey];
  if (!id) throw new Error(`${envKey} is not set`);
  return id;
}

/**
 * List customers by exact email (GET /customers?email=...).
 * Official API: https://developer.paddle.com/api-reference/customers/list-customers
 */
async function findPaddleCustomerByEmail(email: string): Promise<{ id: string } | null> {
  const url = new URL(`${PADDLE_API_BASE}/customers`);
  url.searchParams.set("email", email);
  url.searchParams.set("per_page", "1");
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle List Customers failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const first = json?.data?.[0];
  return first ? { id: first.id } : null;
}

/**
 * Create Paddle customer (POST /customers).
 * Official API: https://developer.paddle.com/api-reference/customers/create-customer
 */
async function createPaddleCustomer(params: {
  email: string;
  name: string | null;
  customData: Record<string, string>;
}): Promise<{ id: string }> {
  const res = await fetch(`${PADDLE_API_BASE}/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      name: params.name ?? undefined,
      custom_data: params.customData,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle Create Customer failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  if (!json?.data?.id) throw new Error("Paddle Create Customer: missing data.id");
  return { id: json.data.id };
}

/**
 * Get existing Paddle customer by email, or create one. Avoids 409 customer_already_exists
 * when the same user (email) checks out again (e.g. different workspace or retry).
 */
async function getOrCreatePaddleCustomer(params: {
  email: string;
  name: string | null;
  customData: Record<string, string>;
}): Promise<{ id: string }> {
  const existing = await findPaddleCustomerByEmail(params.email);
  if (existing) return existing;
  return createPaddleCustomer(params);
}

/**
 * Create Paddle transaction (POST /transactions) and return checkout URL.
 * Official API: https://developer.paddle.com/api-reference/transactions/create-transaction
 * Response includes checkout.url for automatically-collected transactions.
 */
async function createPaddleTransaction(params: {
  customerId: string;
  priceId: string;
  customData: { tenantId: string; planCode: string };
  currencyCode?: string;
}): Promise<{ checkoutUrl: string }> {
  const body = {
    customer_id: params.customerId,
    items: [{ price_id: params.priceId, quantity: 1 }],
    custom_data: params.customData,
    collection_mode: "automatic" as const,
    currency_code: params.currencyCode ?? "USD",
  };
  const res = await fetch(`${PADDLE_API_BASE}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    let errJson: { error?: { code?: string; detail?: string } } | null = null;
    try {
      errJson = JSON.parse(errText) as { error?: { code?: string; detail?: string } };
    } catch {
      // ignore
    }
    const code = errJson?.error?.code;
    if (res.status === 400 && code === "transaction_default_checkout_url_not_set") {
      throw new Error(
        "Checkout is not fully configured. Set the Default Payment Link in Paddle Dashboard under Checkout settings (Developer Tools or Checkout)."
      );
    }
    throw new Error(`Paddle Create Transaction failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as {
    data?: { checkout?: { url?: string }; id?: string };
  };
  const url = json?.data?.checkout?.url;
  if (!url || typeof url !== "string") {
    throw new Error("Paddle Create Transaction: missing checkout.url in response");
  }
  return { checkoutUrl: url };
}

export type CreateCheckoutSessionParams = {
  tenantId: string;
  planCode: PlanCode;
  customerEmail: string;
  customerName: string | null;
};

/**
 * Create Paddle checkout session: create customer, then transaction; return checkout.url.
 * Does NOT create Subscription record (webhook does that).
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<{ checkoutUrl: string }> {
  if (params.planCode === "free") {
    throw new Error("Cannot checkout free plan");
  }

  const plan = await prisma.plan.findUnique({
    where: { code: params.planCode, isActive: true },
    select: { id: true },
  });
  if (!plan) throw new Error(`Plan not found: ${params.planCode}`);

  const existing = await prisma.subscription.findFirst({
    where: {
      tenantId: params.tenantId,
      status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
      planId: plan.id,
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Already have an active subscription for this plan");
  }

  const customer = await getOrCreatePaddleCustomer({
    email: params.customerEmail,
    name: params.customerName,
    customData: { tenantId: params.tenantId },
  });

  const priceId = getPriceId(params.planCode);
  const { checkoutUrl } = await createPaddleTransaction({
    customerId: customer.id,
    priceId,
    customData: { tenantId: params.tenantId, planCode: params.planCode },
  });

  return { checkoutUrl };
}
