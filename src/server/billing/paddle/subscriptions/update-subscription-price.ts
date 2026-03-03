import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";
import { getPlanCodeFromPriceId } from "@/server/billing/providers/paddle/map-paddle-event";
import { fetchPaddleSubscription } from "@/server/billing/providers/paddle/fetch-subscription";

export type UpdateSubscriptionPriceParams = {
  providerSubscriptionId: string;
  targetPlanCode: "starter" | "pro" | "enterprise";
  /**
   * - "immediate": upgrade; Paddle charges prorated difference now (proration_billing_mode: prorated_immediately).
   *   Same billing cycle preserved. Entitlements update after webhook.
   * - "next_period": apply new price at period end with no proration/credits (proration_billing_mode: do_not_bill).
   *   Used by period-close when applying a scheduled downgrade, or when resuming from cancellation.
   *   Next payment = new plan price. Do NOT use for user-initiated downgrade at click (we schedule in DB only).
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
 * Always fetches the current subscription first; uses exactly one existing recurring item.
 * - Upgrade (effective === "immediate"): proration_billing_mode = "prorated_immediately"; charge now.
 * - Downgrade (effective === "next_period"): proration_billing_mode = "do_not_bill"; no proration/credits.
 *   Used by period-close when applying a scheduled downgrade, or when resuming from cancellation.
 *   User-initiated downgrades are NOT sent to Paddle at click time (DB-only schedule); Paddle is updated at period end.
 * Idempotent: skip PATCH when the single item already matches newPriceId.
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
    if (!current) {
      return { ok: false, error: "Subscription not found in Paddle." };
    }
    const items = current.items ?? [];
    const firstItem = items[0] as
      | { id?: string; price_id?: string; price?: { id?: string }; recurring?: boolean }
      | undefined;
    const firstPriceId = firstItem?.price_id ?? firstItem?.price?.id;

    if (items.length !== 1) {
      return {
        ok: false,
        error: `Expected exactly one subscription item; got ${items.length}. Refusing to update to avoid duplicate items.`,
      };
    }
    if (firstItem?.recurring === false) {
      return { ok: false, error: "Expected a recurring subscription item." };
    }

    const alreadyCorrect = firstPriceId === newPriceId;
    if (alreadyCorrect) {
      return { ok: true };
    }

    const itemIdForLog = firstItem?.id ?? null;

    const prorationMode =
      effective === "next_period" ? "do_not_bill" : "prorated_immediately";
    const body: Record<string, unknown> = {
      items: [{ price_id: newPriceId, quantity: 1 }],
      proration_billing_mode: prorationMode,
    };
    if (clearScheduledCancel) {
      body.scheduled_change = null;
    }
    if (tenantId) {
      body.custom_data = { tenantId, planCode: targetPlanCode };
    }

    // Paddle does not allow changing items and next_billed_at in the same request.
    // We do not send next_billed_at on upgrade; proration uses Paddle's current billing period.

    // Log payload for downgrades (no secrets in body; redact if adding sensitive fields later).
    if (effective === "next_period") {
      console.info("[updateSubscriptionPrice] downgrade PATCH payload", {
        providerSubscriptionId,
        targetPlanCode,
        proration_billing_mode: prorationMode,
        items: body.items,
        scheduled_change: body.scheduled_change ?? "(not set)",
        has_custom_data: Boolean(body.custom_data),
      });
    }
    if (effective === "immediate") {
      console.info("[updateSubscriptionPrice] upgrade PATCH payload", {
        providerSubscriptionId,
        targetPlanCode,
        proration_billing_mode: prorationMode,
      });
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

    if (effective === "next_period") {
      const after = await fetchPaddleSubscription(providerSubscriptionId);
      const scheduledChange = after?.scheduled_change ?? null;
      const nextBilledAt =
        (after as { next_billed_at?: string })?.next_billed_at ?? null;
      const itemsPreview = (after as { items?: Array<{ price_id?: string; price?: { id?: string } }> })?.items?.map(
        (it) => it.price_id ?? it.price?.id
      );
      console.info("[updateSubscriptionPrice] downgrade applied (do_not_bill)", {
        providerSubscriptionId,
        targetPlanCode,
        request_id: requestId,
        existing_item_id: itemIdForLog,
        scheduled_change: scheduledChange != null,
        next_billed_at: nextBilledAt ?? undefined,
        items_price_ids: itemsPreview ?? undefined,
      });
    } else if (requestId) {
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
