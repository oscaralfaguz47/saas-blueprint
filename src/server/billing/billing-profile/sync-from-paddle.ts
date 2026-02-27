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

/**
 * EPIC 5: Sync TenantBillingProfile from Paddle (customer/address). Idempotent by key.
 * Uses GET /customers/{id}/addresses for address data (Customer GET does not include full address).
 * Use idempotency key BILLING_PROFILE_FETCH:${tenantId}:${providerCustomerId}:${YYYY-MM-DD} for backfill.
 */
export async function syncBillingProfileFromPaddle(params: {
  tenantId: string;
  providerCustomerId: string;
  idempotencyKey?: string;
}): Promise<{ updated: boolean }> {
  const { tenantId, providerCustomerId } = params;

  const addressesRes = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/addresses`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
    }
  );
  if (!addressesRes.ok) return { updated: false };

  const addressesJson = (await addressesRes.json()) as {
    data?: PaddleAddress[];
  };
  const firstAddress = addressesJson?.data?.[0] ?? null;
  const mapped = mapAddressToProfile(firstAddress);

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
      companyName: null,
      vatId: null,
      providerCustomerId,
      providerAddressId: mapped.providerAddressId,
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
      lastSyncedAt: new Date(),
      syncSource: "fetch",
    },
  });
  return { updated: true };
}
