import { z } from "zod";

/** E-010 outbound webhook event names (subset). */
export const WEBHOOK_EVENT_NAMES = [
  "record.created",
  "record.finance.assigned",
  "record.approval.requested",
  "record.approval.completed",
  "record.payment.status_changed",
  "record.closed",
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENT_NAMES)[number];

const WEBHOOK_EVENT_ENUM_TUPLE = [
  WEBHOOK_EVENT_NAMES[0],
  ...WEBHOOK_EVENT_NAMES.slice(1),
] as [WebhookEventName, ...WebhookEventName[]];

export const webhookEventNameSchema = z.enum(WEBHOOK_EVENT_ENUM_TUPLE);
