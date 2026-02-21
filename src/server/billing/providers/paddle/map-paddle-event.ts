import "server-only";

import type { SubscriptionStatus } from "@prisma/client";
import type {
  BillingEventSanitizedPayload,
  PaddlePlanCode,
  PaddleSubscriptionData,
} from "./paddle-types";
import { paddleMetadataSchema, paddleSubscriptionDataSchema } from "./paddle-types";

/** Resolve planCode from Paddle price_id (fallback when custom_data missing). */
export function getPlanCodeFromPriceId(priceId: string | null | undefined): PaddlePlanCode | null {
  if (!priceId || typeof priceId !== "string") return null;
  const starter = process.env.PADDLE_PRICE_ID_STARTER;
  const pro = process.env.PADDLE_PRICE_ID_PRO;
  if (starter && priceId === starter) return "starter";
  if (pro && priceId === pro) return "pro";
  return null;
}

/** Configurable grace period (days) when status is past_due. */
const GRACE_DAYS = Number(process.env.PADDLE_GRACE_DAYS) || 7;

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
  scheduledChange: { action?: string } | null | undefined
): boolean {
  return scheduledChange?.action === "cancel";
}
