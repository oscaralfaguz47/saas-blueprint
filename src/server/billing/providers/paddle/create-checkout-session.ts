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
 * Thrown when Paddle returns a validation error for tax/business (e.g. "Invalid tax identifier"
 * for unsupported countries like Costa Rica). Route handler maps this to TAX_IDENTIFIER_VALIDATION_FAILED
 * so the UI can offer "Continue without Tax ID".
 */
export class TaxIdentifierValidationError extends Error {
  constructor(message: string = "Tax identifier could not be validated for this country.") {
    super(message);
    this.name = "TaxIdentifierValidationError";
  }
}

/**
 * Invoice-first: we create Paddle address when user provides billing address so it appears on invoices.
 * We create Paddle business when user provides company name; include contact (name/email) for invoices.
 * tax_identifier is sent only when country is in TAX_VALIDATION_SUPPORTED (vatB2bStrict); otherwise retry without if Paddle rejects.
 */
const TAX_VALIDATION_SUPPORTED_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "NO", "CH",
]);

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
 * Create Paddle address (POST /customers/{customer_id}/addresses).
 * Official API: https://developer.paddle.com/api-reference/addresses/create-address
 * The address is sent to Paddle so it can appear on invoices/bills. We do not proceed without it
 * when the user has provided billing details. If you get 403, enable "Addresses" on your API key.
 */
async function createPaddleAddress(params: {
  customerId: string;
  countryCode: string;
  postalCode?: string | null;
  region?: string | null;
  city?: string | null;
  firstLine?: string | null;
  secondLine?: string | null;
}): Promise<{ id: string }> {
  const res = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(params.customerId)}/addresses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        country_code: params.countryCode,
        postal_code: params.postalCode ?? undefined,
        region: params.region ?? undefined,
        city: params.city ?? undefined,
        first_line: params.firstLine ?? undefined,
        second_line: params.secondLine ?? undefined,
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403) {
      throw new Error(
        "The billing address could not be sent to Paddle (it won't appear on invoices). " +
          "Your Paddle API key needs the \"Addresses\" permission. In Paddle Dashboard go to Developer tools → Authentication, " +
          "edit your API key, and enable Addresses. Then try checkout again."
      );
    }
    throw new Error(`Paddle Create Address failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  if (!json?.data?.id) throw new Error("Paddle Create Address: missing data.id");
  return { id: json.data.id };
}

/**
 * Create Paddle business (POST /customers/{customer_id}/businesses).
 * Official API: https://developer.paddle.com/api-reference/businesses/create-business
 * Only call when we intend to send tax_identifier (country in TAX_VALIDATION_SUPPORTED) to avoid
 * "Invalid tax identifier" for countries Paddle cannot validate (e.g. Costa Rica).
 */
async function createPaddleBusiness(params: {
  customerId: string;
  name: string;
  taxIdentifier?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
}): Promise<{ id: string }> {
  const body: { name: string; tax_identifier?: string; contacts?: Array<{ name: string; email: string }> } = {
    name: params.name,
  };
  if (params.taxIdentifier?.trim()) body.tax_identifier = params.taxIdentifier.trim();
  if (params.contactName?.trim() && params.contactEmail?.trim()) {
    body.contacts = [{ name: params.contactName.trim(), email: params.contactEmail.trim() }];
  }
  const res = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(params.customerId)}/businesses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403) {
      throw new Error(
        "Business details could not be sent to Paddle (they won't appear on invoices). " +
          "Your Paddle API key needs the \"Businesses\" permission. In Paddle Dashboard go to Developer tools → Authentication, " +
          "edit your API key, and enable Businesses. Then try checkout again."
      );
    }
    type PaddleError = { error?: { code?: string; detail?: string; errors?: Array<{ pointer?: string }> } };
    let errJson: PaddleError | null = null;
    try {
      errJson = JSON.parse(errText) as PaddleError;
    } catch {
      // ignore
    }
    const pointer = errJson?.error?.errors?.[0]?.pointer ?? "";
    if (res.status === 400 && (pointer.includes("business") || pointer.includes("tax"))) {
      throw new TaxIdentifierValidationError(
        errJson?.error?.detail ?? "Tax identifier could not be validated for this country."
      );
    }
    throw new Error(`Paddle Create Business failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  if (!json?.data?.id) throw new Error("Paddle Create Business: missing data.id");
  return { id: json.data.id };
}

/**
 * Create Paddle transaction (POST /transactions) and return checkout URL.
 * Official API: https://developer.paddle.com/api-reference/transactions/create-transaction
 * address_id: optional; when provided transaction can be ready (not draft). Do NOT pass business_id
 * unless we created a business for a TAX_VALIDATION_SUPPORTED country to avoid forcing tax validation.
 */
async function createPaddleTransaction(params: {
  customerId: string;
  priceId: string;
  customData: { tenantId: string; planCode: string };
  currencyCode?: string;
  addressId?: string | null;
  businessId?: string | null;
}): Promise<{ checkoutUrl: string }> {
  const body: Record<string, unknown> = {
    customer_id: params.customerId,
    items: [{ price_id: params.priceId, quantity: 1 }],
    custom_data: params.customData,
    collection_mode: "automatic" as const,
    currency_code: params.currencyCode ?? "USD",
  };
  if (params.addressId) body.address_id = params.addressId;
  if (params.businessId) body.business_id = params.businessId;

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
    type PaddleErr = { error?: { code?: string; detail?: string; errors?: Array<{ pointer?: string }> } };
    let errJson: PaddleErr | null = null;
    try {
      errJson = JSON.parse(errText) as PaddleErr;
    } catch {
      // ignore
    }
    const code = errJson?.error?.code;
    if (res.status === 400 && code === "transaction_default_checkout_url_not_set") {
      throw new Error(
        "Checkout is not fully configured. Set the Default Payment Link in Paddle Dashboard under Checkout settings (Developer Tools or Checkout)."
      );
    }
    const pointer = errJson?.error?.errors?.[0]?.pointer ?? "";
    if (res.status === 400 && (pointer.includes("business") || pointer.includes("tax") || pointer.includes("/data/business"))) {
      throw new TaxIdentifierValidationError(
        errJson?.error?.detail ?? "Tax identifier could not be validated for this country."
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

export type BillingAddressInput = {
  countryCode: string;
  postalCode?: string | null;
  region?: string | null;
  city?: string | null;
  firstLine?: string | null;
  secondLine?: string | null;
};

export type BusinessInput = {
  companyName: string;
  taxIdentifier?: string | null;
  countryCode: string;
};

export type CreateCheckoutSessionParams = {
  tenantId: string;
  planCode: PlanCode;
  customerEmail: string;
  customerName: string | null;
  billingAddress?: BillingAddressInput | null;
  business?: BusinessInput | null;
  /** When true, do not send tax_identifier to Paddle (e.g. user chose "Continue without Tax ID"). */
  skipTaxId?: boolean;
};

export type CreateCheckoutSessionResult = {
  checkoutUrl: string;
  paddleCustomerId: string;
  paddleAddressId: string | null;
  paddleBusinessId: string | null;
};

/**
 * Create Paddle checkout session: customer, optional address (invoice-first), optional business
 * with tax retry; then transaction. Returns checkout URL and Paddle IDs for BillingProfile persistence.
 * Does NOT create Subscription record (webhook does that).
 * Throws TaxIdentifierValidationError only when we already retried without tax (so UI can offer "Continue without Tax ID").
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

  let addressId: string | null = null;
  if (params.billingAddress?.countryCode?.trim()) {
    const countryCode = params.billingAddress.countryCode.trim().toUpperCase();
    const hasFullAddress =
      !!params.billingAddress.city?.trim() &&
      !!params.billingAddress.firstLine?.trim();
    try {
      const addr = await createPaddleAddress({
        customerId: customer.id,
        countryCode,
        postalCode: params.billingAddress.postalCode?.trim() || undefined,
        region: params.billingAddress.region?.trim() || undefined,
        city: params.billingAddress.city?.trim() || undefined,
        firstLine: params.billingAddress.firstLine?.trim() || undefined,
        secondLine: params.billingAddress.secondLine?.trim() || undefined,
      });
      addressId = addr.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isBadRequest =
        message.includes("400") ||
        message.includes("postal_code") ||
        message.includes("bad_request") ||
        message.includes("required");
      if (hasFullAddress || !isBadRequest) throw err;
      // Country-only: Paddle requires postal_code/region for some countries; leave addressId null
    }
  }

  let businessId: string | null = null;
  if (params.business?.companyName?.trim()) {
    const name = params.business.companyName.trim();
    const taxIdentifier = params.business.taxIdentifier?.trim() || null;
    const skipTaxId = !!params.skipTaxId;
    const country = (params.business.countryCode || "").toUpperCase();
    const sendTaxToPaddle =
      !!taxIdentifier && !skipTaxId && TAX_VALIDATION_SUPPORTED_COUNTRY_CODES.has(country);
    try {
      const business = await createPaddleBusiness({
        customerId: customer.id,
        name,
        taxIdentifier: sendTaxToPaddle ? taxIdentifier : null,
        contactName: params.customerName,
        contactEmail: params.customerEmail,
      });
      businessId = business.id;
    } catch (err) {
      if (err instanceof TaxIdentifierValidationError && taxIdentifier && !skipTaxId) {
        const business = await createPaddleBusiness({
          customerId: customer.id,
          name,
          taxIdentifier: null,
          contactName: params.customerName,
          contactEmail: params.customerEmail,
        });
        businessId = business.id;
      } else {
        throw err;
      }
    }
  }

  const priceId = getPriceId(params.planCode);
  const { checkoutUrl } = await createPaddleTransaction({
    customerId: customer.id,
    priceId,
    customData: { tenantId: params.tenantId, planCode: params.planCode },
    addressId: addressId ?? undefined,
    businessId: businessId ?? undefined,
  });

  return {
    checkoutUrl,
    paddleCustomerId: customer.id,
    paddleAddressId: addressId,
    paddleBusinessId: businessId,
  };
}
