import "server-only";

import { env } from "@/lib/env";
import type { SubscriptionStatus } from "@prisma/client";
import type {
  BillingEventSanitizedPayload,
  PaddlePlanCode,
  PaddleSubscriptionData,
} from "./paddle-types";
import { paddleMetadataSchema, paddleSubscriptionDataSchema } from "./paddle-types";

const PLAN_TIER_ORDER: Record<PaddlePlanCode, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  scale: 3,
};

/** Resolve planCode from Paddle price_id (fallback when custom_data missing). */
export function getPlanCodeFromPriceId(priceId: string | null | undefined): PaddlePlanCode | null {
  if (!priceId || typeof priceId !== "string") return null;
  const starter = env.PADDLE_PRICE_ID_STARTER;
  const pro = env.PADDLE_PRICE_ID_PRO;
  const scale = env.PADDLE_PRICE_ID_SCALE;
  if (starter && priceId === starter) return "starter";
  if (pro && priceId === pro) return "pro";
  if (scale && priceId === scale) return "scale";
  const starterA = env.PADDLE_PRICE_ID_STARTER_ANNUAL;
  const proA = env.PADDLE_PRICE_ID_PRO_ANNUAL;
  const scaleA = env.PADDLE_PRICE_ID_SCALE_ANNUAL;
  if (starterA && priceId === starterA) return "starter";
  if (proA && priceId === proA) return "pro";
  if (scaleA && priceId === scaleA) return "scale";
  return null;
}

/**
 * From subscription items, return the highest-tier plan code (starter < pro < scale).
 * Used when a subscription has multiple items (e.g. duplicate from second checkout) so we show the effective plan.
 * Supports both item.price_id (API) and item.price.id (webhook payload).
 */
export function getHighestPlanCodeFromItems(
  items: Array<{ price_id?: string; price?: { id?: string } }> | null | undefined
): PaddlePlanCode | null {
  if (!items?.length) return null;
  let highest: PaddlePlanCode | null = null;
  for (const item of items) {
    const priceId = item.price_id ?? item.price?.id;
    const code = getPlanCodeFromPriceId(priceId);
    if (!code || code === "free") continue;
    if (
      !highest ||
      PLAN_TIER_ORDER[code] > PLAN_TIER_ORDER[highest as PaddlePlanCode]
    ) {
      highest = code;
    }
  }
  return highest;
}

/**
 * Detect billing interval from Paddle subscription billing_cycle interval.
 * Paddle returns billing_cycle: { interval: "month" | "year", frequency: number }
 * Returns "annual" only when interval === "year". Defaults to "monthly".
 */
export function getBillingIntervalFromPaddle(
  billingCycle: { interval: string; frequency: number } | null | undefined
): "monthly" | "annual" {
  if (!billingCycle) return "monthly";
  return billingCycle.interval === "year" ? "annual" : "monthly";
}

/** Configurable grace period (days) when status is past_due. */
const GRACE_DAYS = env.PADDLE_GRACE_DAYS ?? 7;

/**
 * Map Paddle subscription status to internal SubscriptionStatus.
 * Paddle: active, trialing, past_due, paused, canceled.
 */
export function mapPaddleStatusToInternal(
  paddleStatus: string
): SubscriptionStatus {
  const s = paddleStatus?.toLowerCase();
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIAL";
    case "past_due":
      return "PAST_DUE";
    case "paused":
      return "SUSPENDED";
    case "canceled":
      return "CANCELED";
    default:
      return "ACTIVE";
  }
}

/**
 * Parse metadata (tenantId, planCode) from subscription custom_data.
 * Validates with Zod; returns null if invalid or missing.
 */
export function parseMetadataFromCustomData(
  customData: Record<string, unknown> | null | undefined
): { tenantId: string; planCode: PaddlePlanCode } | null {
  if (!customData || typeof customData !== "object") return null;
  const result = paddleMetadataSchema.safeParse(customData);
  return result.success ? result.data : null;
}

/**
 * Validate and parse subscription data from webhook payload.
 */
export function parseSubscriptionData(
  data: unknown
): PaddleSubscriptionData | null {
  const result = paddleSubscriptionDataSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Build sanitized BillingEvent payload (no PII).
 */
export function buildSanitizedPayload(params: {
  providerEventId: string;
  eventType: string;
  subscriptionId?: string;
  customerId?: string;
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  tenantId?: string;
  planCode?: string;
  occurredAt?: string;
}): BillingEventSanitizedPayload {
  return {
    providerEventId: params.providerEventId,
    eventType: params.eventType,
    subscriptionId: params.subscriptionId,
    customerId: params.customerId,
    status: params.status,
    currentPeriodStart: params.currentPeriodStart,
    currentPeriodEnd: params.currentPeriodEnd,
    tenantId: params.tenantId,
    planCode: params.planCode,
    occurredAt: params.occurredAt,
  };
}

/**
 * Compute graceUntil date when status is PAST_DUE (now + grace days).
 */
export function getGraceUntilForPastDue(): Date {
  const d = new Date();
  d.setDate(d.getDate() + GRACE_DAYS);
  return d;
}

/**
 * Determine if Paddle scheduled_change indicates cancel at period end.
 */
export function isCancelAtPeriodEnd(
  scheduledChange: { action?: string | null } | null | undefined
): boolean {
  return scheduledChange?.action === "cancel";
}
