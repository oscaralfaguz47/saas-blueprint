import "server-only";

import { z } from "zod";
import { cuidSchema } from "@/lib/validations/common";

/** Canonical plan codes (webhook must never assign "free"; checkout never creates free). */
export const PADDLE_PLAN_CODE = z.enum(["free", "starter", "pro"]);
export type PaddlePlanCode = z.infer<typeof PADDLE_PLAN_CODE>;

/** Allowlist of Paddle event types we process. Others are logged and ignored. */
export const PADDLE_SUPPORTED_EVENT_TYPES = [
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.resumed",
  "subscription.trialing",
  "subscription.activated",
  "transaction.completed",
] as const;
export type PaddleSupportedEventType = (typeof PADDLE_SUPPORTED_EVENT_TYPES)[number];

/** Custom data we attach to transaction/subscription (tenantId, planCode). */
export const paddleMetadataSchema = z.object({
  tenantId: cuidSchema,
  planCode: PADDLE_PLAN_CODE,
});

/** Current billing period from Paddle (ISO timestamps). */
export const paddleBillingPeriodSchema = z
  .object({
    starts_at: z.string(),
    ends_at: z.string(),
  })
  .refine(
    (p) => {
      const start = new Date(p.starts_at).getTime();
      const end = new Date(p.ends_at).getTime();
      return !Number.isNaN(start) && !Number.isNaN(end) && start < end;
    },
    { message: "Period start must be before period end" }
  );

/** Subscription data shape in Paddle webhook (only fields we use). */
export const paddleSubscriptionDataSchema = z.object({
  id: z.string().min(1).max(191),
  status: z.string().min(1).max(50),
  customer_id: z.string().min(1).max(191),
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
  current_billing_period: paddleBillingPeriodSchema.nullable().optional(),
  scheduled_change: z
    .object({
      action: z.string().optional(),
      effective_at: z.string().optional(),
      resume_at: z.string().optional(),
    })
    .nullable()
    .optional(),
});

/** Top-level webhook envelope (event_id, event_type, data). */
export const paddleWebhookEnvelopeSchema = z.object({
  event_id: z.string().min(1).max(191),
  event_type: z.string().min(1).max(80),
  occurred_at: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type PaddleWebhookEnvelope = z.infer<typeof paddleWebhookEnvelopeSchema>;
export type PaddleSubscriptionData = z.infer<typeof paddleSubscriptionDataSchema>;

/**
 * Sanitized payload for BillingEvent.payload (no PII, no payment instruments).
 * Persist only: event id, event type, subscription id, customer id, status,
 * period start/end, tenantId, planCode.
 */
export type BillingEventSanitizedPayload = {
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
};

/** Check if event type is in our allowlist. */
export function isSupportedPaddleEventType(
  eventType: string
): eventType is PaddleSupportedEventType {
  return (PADDLE_SUPPORTED_EVENT_TYPES as readonly string[]).includes(eventType);
}
