import "server-only";

import { prisma } from "@/server/db";
import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle/paddle-api";

const IDEMPOTENCY_PREFIX_FETCH = "BILLING_PROFILE_FETCH:";

/** Paddle address from GET /customers/{id}/addresses (list) or address.updated webhook. */
export type PaddleAddress = {
  id?: string;
  customer_id?: string;
  country_code?: string | null;
  postal_code?: string | null;
  first_line?: string | null;
  second_line?: string | null;
  city?: string | null;
  region?: string | null;
};

/** Paddle business from GET /customers/{id}/businesses (list) or business webhooks. */
export type PaddleBusiness = {
  id?: string;
  customer_id?: string;
  name?: string | null;
  tax_identifier?: string | null;
};

export function mapAddressToProfile(address: PaddleAddress | null): {
  countryCode: string;
  postalCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  providerAddressId: string | null;
} {
  if (!address) {
    return {
      countryCode: "US",
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      region: null,
      providerAddressId: null,
    };
  }
  const rawCountry = address.country_code?.trim?.();
  const countryCode =
    rawCountry && rawCountry.length >= 2
      ? rawCountry.slice(0, 2).toUpperCase()
      : "US";
  return {
    countryCode,
    postalCode: address.postal_code?.slice(0, 32) ?? null,
    addressLine1: address.first_line?.slice(0, 120) ?? null,
    addressLine2: address.second_line?.slice(0, 120) ?? null,
    city: address.city?.slice(0, 80) ?? null,
    region: address.region?.slice(0, 80) ?? null,
    providerAddressId: address.id?.slice(0, 191) ?? null,
  };
}

function mapBusinessToProfile(business: PaddleBusiness | null): {
  companyName: string | null;
  vatId: string | null;
  providerBusinessId: string | null;
} {
  if (!business) {
    return { companyName: null, vatId: null, providerBusinessId: null };
  }
  return {
    companyName: business.name?.trim?.()?.slice(0, 160) ?? null,
    vatId: business.tax_identifier?.trim?.()?.slice(0, 64) ?? null,
    providerBusinessId: business.id?.trim?.()?.slice(0, 191) ?? null,
  };
}

/**
 * EPIC 5: Sync TenantBillingProfile from Paddle (customer address + business). Idempotent by key.
 * Uses GET /customers/{id}/addresses and GET /customers/{id}/businesses so VAT/company from checkout are stored.
 */
export async function syncBillingProfileFromPaddle(params: {
  tenantId: string;
  providerCustomerId: string;
  idempotencyKey?: string;
}): Promise<{ updated: boolean }> {
  const { tenantId, providerCustomerId } = params;

  const [addressesRes, businessesRes] = await Promise.all([
    fetch(
      `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/addresses`,
      { method: "GET", headers: { Authorization: `Bearer ${getPaddleApiKey()}` } }
    ),
    fetch(
      `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/businesses`,
      { method: "GET", headers: { Authorization: `Bearer ${getPaddleApiKey()}` } }
    ),
  ]);
  if (!addressesRes.ok) return { updated: false };

  const addressesJson = (await addressesRes.json()) as { data?: PaddleAddress[] };
  const firstAddress = addressesJson?.data?.[0] ?? null;
  const mapped = mapAddressToProfile(firstAddress);

  let businessMapped = mapBusinessToProfile(null);
  if (businessesRes.ok) {
    const businessesJson = (await businessesRes.json()) as { data?: PaddleBusiness[] };
    const firstBusiness = businessesJson?.data?.[0] ?? null;
    businessMapped = mapBusinessToProfile(firstBusiness);
  }

  await prisma.tenantBillingProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      countryCode: mapped.countryCode,
      postalCode: mapped.postalCode,
      region: mapped.region,
      city: mapped.city,
      addressLine1: mapped.addressLine1,
      addressLine2: mapped.addressLine2,
      companyName: businessMapped.companyName,
      vatId: businessMapped.vatId,
      providerCustomerId,
      providerAddressId: mapped.providerAddressId,
      providerBusinessId: businessMapped.providerBusinessId,
      lastSyncedAt: new Date(),
      syncSource: "fetch",
    },
    update: {
      countryCode: mapped.countryCode,
      postalCode: mapped.postalCode,
      region: mapped.region,
      city: mapped.city,
      addressLine1: mapped.addressLine1,
      addressLine2: mapped.addressLine2,
      providerAddressId: mapped.providerAddressId,
      companyName: businessMapped.companyName ?? undefined,
      vatId: businessMapped.vatId ?? undefined,
      providerBusinessId: businessMapped.providerBusinessId ?? undefined,
      lastSyncedAt: new Date(),
      syncSource: "fetch",
    },
  });
  return { updated: true };
}
