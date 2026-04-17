import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import type { PlanCode } from "@/server/billing/provider-types";

function paddleSignal(ms = 15_000): AbortSignal {
  return AbortSignal.timeout(ms);
}

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
 * Fetch a single Paddle customer by ID and verify it belongs to this tenant.
 * Returns the customer ID if it exists and belongs to tenantId, null otherwise.
 */
async function verifyPaddleCustomerBelongsToTenant(
  customerId: string,
  tenantId: string
): Promise<{ id: string } | null> {
  const res = await fetch(`${PADDLE_API_BASE}/customers/${encodeURIComponent(customerId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    signal: paddleSignal(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { id: string; custom_data?: Record<string, string> | null };
  };
  const customer = json?.data;
  if (!customer?.id) return null;
  const customerTenantId = customer.custom_data?.tenantId;
  if (customerTenantId && customerTenantId !== tenantId) {
    return null;
  }
  if (!customerTenantId) {
    console.warn(
      `[billing] Paddle customer ${customer.id} has no tenantId in custom_data — allowing reuse for tenant ${tenantId}`
    );
  }
  return { id: customer.id };
}

function getPriceIdForPlan(
  planCode: "starter" | "pro" | "scale",
  billingInterval: "monthly" | "annual"
): string | undefined {
  if (billingInterval === "annual") {
    if (planCode === "starter") return env.PADDLE_PRICE_ID_STARTER_ANNUAL;
    if (planCode === "pro") return env.PADDLE_PRICE_ID_PRO_ANNUAL;
    if (planCode === "scale") return env.PADDLE_PRICE_ID_SCALE_ANNUAL;
  }
  if (planCode === "starter") return env.PADDLE_PRICE_ID_STARTER;
  if (planCode === "pro") return env.PADDLE_PRICE_ID_PRO;
  if (planCode === "scale") return env.PADDLE_PRICE_ID_SCALE;
  return undefined;
}

function getEnvironment(): "sandbox" | "production" {
  return env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

/**
 * Find a Paddle customer by email that belongs to this specific tenant.
 * Fetches up to 10 results and verifies custom_data.tenantId to prevent cross-tenant reuse.
 * Returns null if no customer is found for this tenant.
 */
async function findPaddleCustomerForTenant(
  email: string,
  tenantId: string
): Promise<{ id: string } | null> {
  const url = new URL(`${PADDLE_API_BASE}/customers`);
  url.searchParams.set("email", email);
  url.searchParams.set("per_page", "10");
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    signal: paddleSignal(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle List Customers failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ id: string; custom_data?: Record<string, string> | null }>;
  };
  const customers = json?.data ?? [];
  const match = customers.find((c) => c.custom_data?.tenantId === tenantId);
  return match ? { id: match.id } : null;
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
    signal: paddleSignal(),
    body: JSON.stringify({
      email: params.email,
      name: params.name ?? undefined,
      custom_data: params.customData,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 409) {
      let conflictingId: string | null = null;
      try {
        const errJson = JSON.parse(errText) as {
          error?: { code?: string; detail?: string };
        };
        if (errJson?.error?.code === "customer_already_exists") {
          const match = errJson.error.detail?.match(/customer of id (ctm_[a-z0-9]+)/);
          conflictingId = match?.[1] ?? null;
        }
      } catch {
        // ignore parse error
      }
      if (conflictingId) {
        return { id: conflictingId };
      }
    }
    throw new Error(`Paddle Create Customer failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  if (!json?.data?.id) throw new Error("Paddle Create Customer: missing data.id");
  return { id: json.data.id };
}

/**
 * Get or create a Paddle customer for a specific tenant.
 * Resolution order:
 * 1. DB: use stored providerCustomerId if it exists and belongs to this tenant in Paddle
 * 2. Paddle email search: find customer with matching custom_data.tenantId
 * 3. Create a new Paddle customer with custom_data.tenantId set (or recover from Paddle 409 when email exists)
 *
 * Cross-tenant reuse is avoided except when Paddle returns 409 for an existing email (e.g. sandbox shared email).
 */
async function getOrCreatePaddleCustomerForTenant(params: {
  tenantId: string;
  email: string;
  name: string | null;
}): Promise<{ id: string }> {
  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId: params.tenantId, provider: "paddle" },
    select: { providerCustomerId: true },
    orderBy: { id: "desc" },
  });

  if (existingSub?.providerCustomerId) {
    const verified = await verifyPaddleCustomerBelongsToTenant(
      existingSub.providerCustomerId,
      params.tenantId
    );
    if (verified) return verified;
    console.warn(
      `[billing] Paddle customer ${existingSub.providerCustomerId} does not belong to tenant ${params.tenantId}. Creating new customer.`
    );
    console.error("[security] billing.customer.cross_tenant_reuse_prevented", {
      event: "billing.customer.cross_tenant_reuse_prevented",
      tenantId: params.tenantId,
      existingCustomerId: existingSub.providerCustomerId,
      timestamp: new Date().toISOString(),
    });
  }

  const byEmail = await findPaddleCustomerForTenant(params.email, params.tenantId);
  if (byEmail) return byEmail;

  const newCustomer = await createPaddleCustomer({
    email: params.email,
    name: params.name,
    customData: { tenantId: params.tenantId },
  });

  await prisma.subscription.updateMany({
    where: { tenantId: params.tenantId, provider: "paddle", providerCustomerId: null },
    data: { providerCustomerId: newCustomer.id },
  });

  return newCustomer;
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
    signal: paddleSignal(),
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
  billingInterval: "monthly" | "annual";
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

  const paidPlan = params.planCode as "starter" | "pro" | "scale";

  const plan = await prisma.plan.findUnique({
    where: { code: paidPlan, isActive: true },
    select: { id: true },
  });
  if (!plan) throw new Error(`Plan not found: ${paidPlan}`);

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

  const customer = await getOrCreatePaddleCustomerForTenant({
    tenantId: params.tenantId,
    email: params.customerEmail,
    name: params.customerName,
  });

  let priceId = getPriceIdForPlan(paidPlan, params.billingInterval);
  if (!priceId && params.billingInterval === "annual") {
    throw new Error(
      `Annual billing is not yet configured for the ${paidPlan} plan. Please contact support or choose monthly billing.`
    );
  }
  if (!priceId) {
    throw new Error(`Cannot checkout: price ID not configured for plan ${paidPlan}`);
  }

  const { transactionId, checkoutUrl } = await createPaddleTransaction({
    customerId: customer.id,
    priceId,
    customData: { tenantId: params.tenantId, planCode: paidPlan },
  });

  return {
    transactionId,
    environment: getEnvironment(),
    checkoutUrl,
  };
}
