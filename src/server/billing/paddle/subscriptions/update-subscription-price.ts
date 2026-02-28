import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";
import { getPlanCodeFromPriceId } from "@/server/billing/providers/paddle/map-paddle-event";
import { fetchPaddleSubscription } from "@/server/billing/providers/paddle/fetch-subscription";

export type UpdateSubscriptionPriceParams = {
  providerSubscriptionId: string;
  targetPlanCode: "starter" | "pro" | "enterprise";
  /**
   * - "immediate": upgrade; Paddle charges prorated difference now, same billing cycle preserved.
   *   Entitlements update only after webhook confirmation (we do not optimistically change plan in DB).
   * - "next_period": downgrade; change takes effect at next billing date, no immediate charge.
   *   User keeps current plan until then; we store pendingPlanCode and apply when webhook confirms.
   */
  effective: "immediate" | "next_period";
  /** When upgrading from cancel-at-period-end, clear cancellation in Paddle. */
  clearScheduledCancel?: boolean;
  /** If set, PATCH will include custom_data so Paddle subscription shows correct planCode. */
  tenantId?: string;
};

function getPriceIdForPlan(planCode: string): string | null {
  const envKey =
    planCode === "starter"
      ? "PADDLE_PRICE_ID_STARTER"
      : planCode === "pro"
        ? "PADDLE_PRICE_ID_PRO"
        : planCode === "enterprise"
          ? "PADDLE_PRICE_ID_ENTERPRISE"
          : null;
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

/**
 * EPIC 5: Update Paddle subscription to new price_id (plan change).
 * Sends COMPLETE items list with only the target price (replaces existing item; never adds a second item).
 * - Upgrade (effective === "immediate"): proration_billing_mode = "prorated_immediately";
 *   Paddle charges prorated difference now and keeps the same billing cycle. We do not change plan in DB
 *   until the webhook confirms; Paddle is the billing source of truth.
 * - Downgrade (effective === "next_period"): proration_billing_mode = "do_not_bill";
 *   change is scheduled for next billing date, no immediate charge. We store pendingPlanCode in DB
 *   for UI; planId is updated only when Paddle sends subscription.updated after the change takes effect.
 * Idempotent: only skip PATCH when items.length === 1 and single item matches newPriceId.
 */
export async function updateSubscriptionPrice(
  params: UpdateSubscriptionPriceParams
): Promise<{ ok: boolean; error?: string }> {
  const { providerSubscriptionId, targetPlanCode, effective, clearScheduledCancel, tenantId } = params;

  const newPriceId = getPriceIdForPlan(targetPlanCode);
  if (!newPriceId) {
    return { ok: false, error: `Invalid plan: ${targetPlanCode}.` };
  }

  try {
    const current = await fetchPaddleSubscription(providerSubscriptionId);
    const items = current?.items ?? [];
    const firstPriceId =
      (items[0] as { price_id?: string; price?: { id?: string } } | undefined)?.price_id ??
      (items[0] as { price?: { id?: string } } | undefined)?.price?.id;
    const alreadyCorrect = items.length === 1 && firstPriceId === newPriceId;

    if (alreadyCorrect) {
      return { ok: true };
    }

    const body: Record<string, unknown> = {
      items: [{ price_id: newPriceId, quantity: 1 }],
      // Upgrade: charge prorated difference immediately; downgrade: no charge until next period.
      proration_billing_mode:
        effective === "next_period" ? "do_not_bill" : "prorated_immediately",
    };
    if (clearScheduledCancel) {
      body.scheduled_change = null;
    }
    if (tenantId) {
      body.custom_data = { tenantId, planCode: targetPlanCode };
    }

    const res = await fetch(
      `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getPaddleApiKey()}`,
        },
        body: JSON.stringify(body),
      }
    );

    const responseText = await res.text();
    let requestId: string | undefined;
    try {
      const parsed = JSON.parse(responseText) as { meta?: { request_id?: string }; error?: unknown };
      requestId = parsed?.meta?.request_id;
    } catch {
      // ignore
    }

    if (!res.ok) {
      const msg = requestId
        ? `Paddle subscription update failed: ${res.status} request_id=${requestId} body=${responseText.slice(0, 500)}`
        : `Paddle subscription update failed: ${res.status} ${responseText.slice(0, 500)}`;
      console.error("[updateSubscriptionPrice]", msg);
      return { ok: false, error: `${res.status}: ${responseText.slice(0, 300)}` };
    }
    if (requestId) {
      console.info("[updateSubscriptionPrice] ok", {
        providerSubscriptionId,
        targetPlanCode,
        request_id: requestId,
      });
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[updateSubscriptionPrice] throw", { providerSubscriptionId, targetPlanCode, message });
    return { ok: false, error: message };
  }
}

export { getPlanCodeFromPriceId };
