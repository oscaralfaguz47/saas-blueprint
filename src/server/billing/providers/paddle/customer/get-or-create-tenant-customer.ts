import "server-only";

import { prisma } from "@/server/db";
import { PADDLE_API_BASE, getPaddleApiKey } from "@/server/billing/paddle/paddle-api";

const PADDLE_PROVIDER = "paddle";
const MAX_EMAIL_LENGTH = 191;
const MAX_CUSTOMER_ID_LENGTH = 191;

/** Thrown when billing email is already used by another workspace (Paddle customer exists with different tenantId). */
export class BillingEmailConflictError extends Error {
  readonly code = "BILLING_EMAIL_CONFLICT";
  constructor(
    message: string = "This billing email is already used by another workspace. Please choose a different billing email (you may use an email alias like name+workspace@domain.com)."
  ) {
    super(message);
    this.name = "BillingEmailConflictError";
  }
}

export function normalizeBillingEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
}

function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getPaddleApiKey()}`,
    "Content-Type": "application/json",
  };
}

type PaddleCustomer = {
  id?: string;
  email?: string | null;
  custom_data?: Record<string, string> | null;
};

/**
 * Find Paddle customer by exact email (GET /customers?email=...&per_page=1).
 */
async function findPaddleCustomerByEmail(
  normalizedEmail: string
): Promise<PaddleCustomer | null> {
  const url = new URL(`${PADDLE_API_BASE}/customers`);
  url.searchParams.set("email", normalizedEmail);
  url.searchParams.set("per_page", "1");
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle List Customers failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { data?: PaddleCustomer[] };
  const first = json?.data?.[0];
  return first ?? null;
}

/**
 * Get single Paddle customer by id (GET /customers/{id}) to read custom_data.
 */
async function getPaddleCustomerById(
  customerId: string
): Promise<PaddleCustomer | null> {
  const res = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(customerId)}`,
    { method: "GET", headers: getAuthHeaders() }
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.text();
    throw new Error(`Paddle Get Customer failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { data?: PaddleCustomer };
  return json?.data ?? null;
}

/**
 * Create Paddle customer (POST /customers). Throws on 409 with code customer_already_exists.
 */
async function createPaddleCustomer(params: {
  email: string;
  name: string;
  customData: Record<string, string>;
}): Promise<{ id: string }> {
  const res = await fetch(`${PADDLE_API_BASE}/customers`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      email: params.email,
      name: params.name.slice(0, 191),
      custom_data: params.customData,
    }),
  });
  const errText = await res.text();
  if (!res.ok) {
    if (res.status === 409) {
      try {
        const parsed = JSON.parse(errText || "{}") as { error?: { code?: string } };
        if (parsed?.error?.code === "customer_already_exists") {
          const err = new Error("PADDLE_409_CUSTOMER_ALREADY_EXISTS");
          (err as { code?: string }).code = "customer_already_exists";
          throw err;
        }
      } catch (e) {
        if (e instanceof BillingEmailConflictError) throw e;
        if ((e as Error & { code?: string })?.code === "customer_already_exists")
          throw e;
      }
    }
    throw new Error(`Paddle Create Customer failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  if (!json?.data?.id) throw new Error("Paddle Create Customer: missing data.id");
  return { id: json.data.id };
}

/**
 * Verify Paddle customer belongs to this tenant via custom_data.tenantId.
 * Returns customer id if match; throws BillingEmailConflictError if mismatch.
 */
function verifyCustomerTenantMatch(
  customer: PaddleCustomer,
  tenantId: string
): string {
  const id = customer?.id?.trim?.();
  if (!id || id.length > MAX_CUSTOMER_ID_LENGTH) {
    throw new BillingEmailConflictError();
  }
  const customData = customer?.custom_data;
  const existingTenantId =
    customData && typeof customData.tenantId === "string"
      ? (customData.tenantId as string).trim()
      : null;
  if (existingTenantId !== null && existingTenantId !== tenantId) {
    throw new BillingEmailConflictError();
  }
  return id;
}

/**
 * Persist mapping and sync Tenant.providerCustomerId for webhook/backward compat.
 */
async function persistTenantCustomerMapping(
  tenantId: string,
  providerCustomerId: string,
  billingEmail: string
): Promise<void> {
  const ctm = providerCustomerId.trim().slice(0, MAX_CUSTOMER_ID_LENGTH);
  await prisma.$transaction([
    prisma.tenantProviderCustomer.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: PADDLE_PROVIDER,
        providerCustomerId: ctm,
        billingEmail,
      },
      update: {
        providerCustomerId: ctm,
      },
    }),
    prisma.tenant.update({
      where: { id: tenantId },
      data: { providerCustomerId: ctm },
    }),
  ]);
}

export type GetOrCreatePaddleCustomerForTenantParams = {
  tenantId: string;
  billingEmail: string;
  customerName: string | null;
};

export type GetOrCreatePaddleCustomerForTenantResult = {
  id: string;
};

/**
 * Get or create Paddle customer for tenant. Uses TenantProviderCustomer as primary mapping.
 * - If mapping exists with providerCustomerId, return it (optionally verify with Paddle; do not block on GET failure).
 * - If not: find by billingEmail in Paddle; verify custom_data.tenantId; persist and return or throw BillingEmailConflictError.
 * - If not found: create; on 409 recover (find by email, verify tenant, persist).
 * Keeps Tenant.providerCustomerId in sync for webhooks.
 */
export async function getOrCreatePaddleCustomerForTenant(
  params: GetOrCreatePaddleCustomerForTenantParams
): Promise<GetOrCreatePaddleCustomerForTenantResult> {
  const { tenantId, billingEmail, customerName } = params;
  const normalizedEmail = normalizeBillingEmail(billingEmail);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, providerCustomerId: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const mapping = await prisma.tenantProviderCustomer.findUnique({
    where: { tenantId },
    select: { providerCustomerId: true, billingEmail: true },
  });

  if (mapping?.providerCustomerId?.trim()) {
    const ctm = mapping.providerCustomerId.trim().slice(0, MAX_CUSTOMER_ID_LENGTH);
    return { id: ctm };
  }

  const emailForPaddle = mapping?.billingEmail
    ? normalizeBillingEmail(mapping.billingEmail)
    : normalizedEmail;

  const existingByEmail = await findPaddleCustomerByEmail(emailForPaddle);
  if (existingByEmail?.id) {
    const full = await getPaddleCustomerById(existingByEmail.id);
    if (full) {
      const id = verifyCustomerTenantMatch(full, tenantId);
      await persistTenantCustomerMapping(tenantId, id, emailForPaddle);
      return { id };
    }
  }

  const name =
    (tenant.name?.trim()?.slice(0, 191)) ??
    (customerName?.trim()?.slice(0, 191)) ??
    "Relitrue Workspace";

  try {
    const created = await createPaddleCustomer({
      email: emailForPaddle,
      name,
      customData: { tenantId, source: "relitrue" },
    });
    const id = created.id.trim().slice(0, MAX_CUSTOMER_ID_LENGTH);
    await persistTenantCustomerMapping(tenantId, id, emailForPaddle);
    return { id };
  } catch (createErr: unknown) {
    if (createErr instanceof BillingEmailConflictError) throw createErr;
    const code = (createErr as { code?: string })?.code;
    if (code === "customer_already_exists") {
      const refetched = await findPaddleCustomerByEmail(emailForPaddle);
      if (refetched?.id) {
        const full = await getPaddleCustomerById(refetched.id);
        if (full) {
          const id = verifyCustomerTenantMatch(full, tenantId);
          await persistTenantCustomerMapping(tenantId, id, emailForPaddle);
          return { id };
        }
      }
      throw new BillingEmailConflictError();
    }
    throw createErr;
  }
}
