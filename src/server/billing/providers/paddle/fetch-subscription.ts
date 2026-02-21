import "server-only";

import {
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
 * Resolve tenantId and planCode from Paddle subscription (custom_data or existing DB + price_id).
 */
export function resolvePlanFromPaddleSubscription(
  subscription: PaddleSubscriptionData,
  existingTenantId: string | null
): { tenantId: string; planCode: "starter" | "pro" } | null {
  const metadata = parseMetadataFromCustomData(subscription.custom_data ?? undefined);
  if (metadata && metadata.planCode !== "free") {
    return { tenantId: metadata.tenantId, planCode: metadata.planCode };
  }
  const priceId = subscription.items?.[0]?.price_id;
  const planCode = getPlanCodeFromPriceId(priceId);
  if (existingTenantId && planCode && planCode !== "free") {
    return { tenantId: existingTenantId, planCode };
  }
  return null;
}

export { mapPaddleStatusToInternal };
