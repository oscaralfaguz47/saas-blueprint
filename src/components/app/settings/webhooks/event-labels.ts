import type { WebhookEventName } from "@/lib/webhooks/event-catalog";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventName, string> = {
  "record.created": "Record created",
  "record.finance.assigned": "Record finance assigned",
  "record.approval.requested": "Record approval requested",
  "record.approval.completed": "Record approval completed",
  "record.payment.status_changed": "Record payment status changed",
  "record.closed": "Record closed",
};
