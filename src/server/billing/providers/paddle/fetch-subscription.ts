import "server-only";

import {
  getHighestPlanCodeFromItems,
  getPlanCodeFromPriceId,
  mapPaddleStatusToInternal,
  parseMetadataFromCustomData,
} from "./map-paddle-event";
import type { PaddleSubscriptionData } from "./paddle-types";
import { paddleSubscriptionDataSchema } from "./paddle-types";

const PADDLE_API_BASE =
  process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}

/**
 * Fetch subscription from Paddle (GET /subscriptions/{id}).
 * Used by reconcile to sync DB when webhook is delayed.
 */
export async function fetchPaddleSubscription(
  providerSubscriptionId: string
): Promise<PaddleSubscriptionData | null> {
  const res = await fetch(
    `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    }
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.text();
    throw new Error(`Paddle Get Subscription failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { data?: unknown };
  const parsed = paddleSubscriptionDataSchema.safeParse(json?.data);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolve tenantId and planCode from Paddle subscription.
 * When there are multiple items, uses the highest-tier plan (e.g. Pro over Starter).
 */
export function resolvePlanFromPaddleSubscription(
  subscription: PaddleSubscriptionData,
  existingTenantId: string | null
): { tenantId: string; planCode: "starter" | "pro" | "enterprise" } | null {
  const metadata = parseMetadataFromCustomData(subscription.custom_data ?? undefined);
  const tenantId = metadata?.tenantId ?? existingTenantId;
  if (!tenantId) return null;

  const planFromItems = getHighestPlanCodeFromItems(subscription.items);
  const planFromMetadata = metadata?.planCode && metadata.planCode !== "free" ? metadata.planCode : null;
  const planCode = planFromItems ?? planFromMetadata;
  if (planCode && planCode !== "free") {
    return { tenantId, planCode };
  }
  return null;
}

/**
 * Fetch customer's billing country from Paddle (GET /customers/{id}/addresses).
 * Returns the first address's country_code (2-letter uppercase) or null.
 * Used by reconcile to set paddleFinalCountryCode and countryMismatch.
 */
export async function fetchPaddleCustomerCountry(
  customerId: string
): Promise<string | null> {
  const res = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(customerId)}/addresses`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    }
  );
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) return null;
    return null;
  }
  const json = (await res.json()) as { data?: Array<{ country_code?: string }> };
  const first = json?.data?.[0];
  const code = first?.country_code?.trim?.();
  if (!code || code.length !== 2) return null;
  return code.toUpperCase();
}

export { mapPaddleStatusToInternal };
