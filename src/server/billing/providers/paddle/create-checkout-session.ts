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
    planCode === "starter"
      ? "PADDLE_PRICE_ID_STARTER"
      : planCode === "pro"
        ? "PADDLE_PRICE_ID_PRO"
        : planCode === "enterprise"
          ? "PADDLE_PRICE_ID_ENTERPRISE"
          : "PADDLE_PRICE_ID_PRO";
  const id = process.env[envKey];
  if (!id) throw new Error(`${envKey} is not set`);
  return id;
}

function getEnvironment(): "sandbox" | "production" {
  return process.env.PADDLE_ENVIRONMENT === "production"
    ? "production"
    : "sandbox";
}

/**
 * List customers by exact email (GET /customers?email=...).
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
 * Get existing Paddle customer by email, or create one.
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
 * Create Paddle transaction (POST /transactions). No address_id — checkout opens on "Your details";
 * user selects country, enters ZIP, clicks Continue so Paddle can calculate tax before Payment.
 * Returns transactionId for Paddle.Checkout.open({ transactionId }) and optional checkoutUrl fallback.
 */
async function createPaddleTransaction(params: {
  customerId: string;
  priceId: string;
  customData: { tenantId: string; planCode: string };
  currencyCode?: string;
}): Promise<{ transactionId: string; checkoutUrl: string | null }> {
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
    const code = (JSON.parse(errText) as { error?: { code?: string } })?.error?.code;
    if (res.status === 400 && code === "transaction_default_checkout_url_not_set") {
      throw new Error(
        "Checkout is not fully configured. Set the Default Payment Link in Paddle Dashboard under Checkout settings."
      );
    }
    throw new Error(`Paddle Create Transaction failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as {
    data?: { id?: string; checkout?: { url?: string } };
  };
  const transactionId = json?.data?.id;
  const checkoutUrl = json?.data?.checkout?.url ?? null;
  if (!transactionId || typeof transactionId !== "string") {
    throw new Error("Paddle Create Transaction: missing data.id in response");
  }
  return { transactionId, checkoutUrl };
}

export type CreateCheckoutSessionParams = {
  tenantId: string;
  planCode: PlanCode;
  customerEmail: string;
  customerName: string | null;
};

export type CreateCheckoutSessionResult = {
  transactionId: string;
  environment: "sandbox" | "production";
  /** Fallback URL if overlay cannot be used; prefer opening by transactionId. */
  checkoutUrl: string | null;
};

/**
 * Create Paddle checkout for overlay: customer (get-or-create by email), then transaction.
 * No address/business stored; Paddle overlay collects email + country and VAT in payment step.
 * Does NOT create Subscription (webhook-only truth).
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
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
  const { transactionId, checkoutUrl } = await createPaddleTransaction({
    customerId: customer.id,
    priceId,
    customData: { tenantId: params.tenantId, planCode: params.planCode },
  });

  return {
    transactionId,
    environment: getEnvironment(),
    checkoutUrl,
  };
}
