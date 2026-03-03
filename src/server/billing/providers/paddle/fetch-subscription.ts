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
  if (parsed.success) return parsed.data;
  // Lenient fallback: subscriptions with scheduled_change (e.g. cancel) may return a shape that fails
  // strict schema (e.g. current_billing_period or scheduled_change format). Build minimal object so
  // updateSubscriptionPrice can read items and proceed; Paddle accepts do_not_bill when clearing scheduled change.
  const raw = json?.data as Record<string, unknown> | undefined;
  if (raw && typeof raw === "object" && raw.id && raw.customer_id && Array.isArray(raw.items) && raw.items.length > 0) {
    const first = raw.items[0] as Record<string, unknown> | undefined;
    const hasPrice = first && (typeof first.price_id === "string" || (first.price && typeof (first.price as { id?: string })?.id === "string"));
    if (hasPrice) {
      const period = raw.current_billing_period as { starts_at?: string; ends_at?: string } | null | undefined;
      const hasPeriod =
        period &&
        typeof period === "object" &&
        typeof period.starts_at === "string" &&
        typeof period.ends_at === "string";
      const currentBillingPeriod: { starts_at: string; ends_at: string } | null = hasPeriod
        ? { starts_at: period.starts_at as string, ends_at: period.ends_at as string }
        : null;
      return {
        id: String(raw.id),
        status: String(raw.status ?? "active"),
        customer_id: String(raw.customer_id),
        items: raw.items as PaddleSubscriptionData["items"],
        custom_data: (raw.custom_data as PaddleSubscriptionData["custom_data"]) ?? null,
        current_billing_period: currentBillingPeriod,
        scheduled_change: (raw.scheduled_change as PaddleSubscriptionData["scheduled_change"]) ?? null,
      };
    }
  }
  return null;
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
