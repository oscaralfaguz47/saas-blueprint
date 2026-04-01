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
  /** Set by app to subscription ID (sub_xxx) for correct tenant resolution in webhooks. */
  description?: string | null;
};

/** Paddle business from GET /customers/{id}/businesses (list) or business webhooks. */
export type PaddleBusiness = {
  id?: string;
  customer_id?: string;
  name?: string | null;
  tax_identifier?: string | null;
};

/** Only persist optional address fields when user actually provided them (non-empty). Country/postal are required from checkout. */
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
  const postal = address.postal_code?.trim?.();
  const firstLine = address.first_line?.trim?.();
  const secondLine = address.second_line?.trim?.();
  const city = address.city?.trim?.();
  const region = address.region?.trim?.();
  return {
    countryCode,
    postalCode: postal ? postal.slice(0, 32) : null,
    addressLine1: firstLine ? firstLine.slice(0, 120) : null,
    addressLine2: secondLine ? secondLine.slice(0, 120) : null,
    city: city ? city.slice(0, 80) : null,
    region: region ? region.slice(0, 80) : null,
    providerAddressId: address.id?.slice(0, 191) ?? null,
  };
}

/** Only persist business when user provided VAT and/or company name in checkout. Do not save business if they left it blank. */
function hasMeaningfulBusinessData(business: PaddleBusiness | null): boolean {
  if (!business) return false;
  const name = business.name?.trim?.();
  const taxId = business.tax_identifier?.trim?.();
  return !!(name || taxId);
}

function mapBusinessToProfile(business: PaddleBusiness | null): {
  companyName: string | null;
  vatId: string | null;
  providerBusinessId: string | null;
} {
  if (!business || !hasMeaningfulBusinessData(business)) {
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
      {
        method: "GET",
        headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
        signal: AbortSignal.timeout(15_000),
      }
    ),
    fetch(
      `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/businesses`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
        signal: AbortSignal.timeout(15_000),
      }
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
  // Update: clear business fields when not meaningful (use null so DB is cleared)
  const updatePayload = {
    countryCode: mapped.countryCode,
    postalCode: mapped.postalCode,
    region: mapped.region,
    city: mapped.city,
    addressLine1: mapped.addressLine1,
    addressLine2: mapped.addressLine2,
    providerAddressId: mapped.providerAddressId,
    companyName: businessMapped.companyName,
    vatId: businessMapped.vatId,
    providerBusinessId: businessMapped.providerBusinessId,
    lastSyncedAt: new Date(),
    syncSource: "fetch",
  };

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
    update: updatePayload,
  });
  return { updated: true };
}
