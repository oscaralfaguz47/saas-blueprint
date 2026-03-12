import "server-only";

import { prisma } from "@/server/db";
import { PADDLE_API_BASE, getPaddleApiKey } from "@/server/billing/paddle/paddle-api";

const PADDLE_CUSTOMER_ID_PREFIX = "ctm_";
const MAX_CUSTOMER_ID_LENGTH = 191;

function isValidStoredCustomerId(value: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith(PADDLE_CUSTOMER_ID_PREFIX) &&
    trimmed.length <= MAX_CUSTOMER_ID_LENGTH
  );
}

export type EnsureTenantPaddleCustomerParams = {
  tenantId: string;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
};

export type EnsureTenantPaddleCustomerResult = {
  providerCustomerId: string;
};

/**
 * Create Paddle customer (POST /customers). Used only when tenant has no providerCustomerId.
 * Does NOT search by email; we want one customer per tenant.
 */
async function createPaddleCustomer(params: {
  name: string;
  email?: string | null;
  customData: Record<string, string>;
}): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    name: params.name.slice(0, 191),
    custom_data: params.customData,
  };
  if (params.email != null && params.email.trim() !== "") {
    body.email = params.email.trim().slice(0, 191);
  }

  const res = await fetch(`${PADDLE_API_BASE}/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPaddleApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
 * Ensures the tenant has a Paddle customer_id. Returns the canonical tenant-scoped customer id.
 * - If tenant.providerCustomerId is set and valid, returns it.
 * - If missing: creates a new Paddle customer and stores it with race-safe conditional update.
 * Multiple parallel checkouts for the same tenant will not create duplicate customers.
 */
export async function ensureTenantPaddleCustomer(
  params: EnsureTenantPaddleCustomerParams
): Promise<EnsureTenantPaddleCustomerResult> {
  const { tenantId, fallbackEmail, fallbackName } = params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, providerCustomerId: true },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  if (isValidStoredCustomerId(tenant.providerCustomerId)) {
    return { providerCustomerId: tenant.providerCustomerId!.trim() };
  }

  const name =
    (tenant.name?.trim()?.slice(0, 191)) ??
    (fallbackName?.trim()?.slice(0, 191)) ??
    "Relitrue Workspace";

  const newCustomer = await createPaddleCustomer({
    name,
    email: fallbackEmail ?? undefined,
    customData: { tenantId, source: "relitrue" },
  });

  const idToStore = newCustomer.id.trim().slice(0, MAX_CUSTOMER_ID_LENGTH);

  const updated = await prisma.tenant.updateMany({
    where: { id: tenantId, providerCustomerId: null },
    data: { providerCustomerId: idToStore },
  });

  if (updated.count === 1) {
    return { providerCustomerId: idToStore };
  }

  const reRead = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { providerCustomerId: true },
  });
  if (reRead?.providerCustomerId && isValidStoredCustomerId(reRead.providerCustomerId)) {
    console.warn(
      "[ensureTenantPaddleCustomer] Created Paddle customer but another request stored first; using existing.",
      { tenantId, createdId: idToStore }
    );
    return { providerCustomerId: reRead.providerCustomerId.trim() };
  }

  throw new Error(
    "Failed to store tenant Paddle customer id; tenant may have been updated concurrently."
  );
}
