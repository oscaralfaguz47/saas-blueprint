import "server-only";

import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import {
  isSupportedPaddleEventType,
  paddleWebhookEnvelopeSchema,
  type BillingEventSanitizedPayload,
} from "./paddle-types";
import {
  buildSanitizedPayload,
  getGraceUntilForPastDue,
  isCancelAtPeriodEnd,
  mapPaddleStatusToInternal,
  parseMetadataFromCustomData,
  parseSubscriptionData,
} from "./map-paddle-event";

const BILLING_WEBHOOK_ACTOR_USER_ID = process.env.BILLING_WEBHOOK_ACTOR_USER_ID;

function getAuditActorUserId(): string | null {
  return BILLING_WEBHOOK_ACTOR_USER_ID ?? null;
}

/**
 * Check if event was already processed (idempotency).
 */
export async function isEventAlreadyProcessed(providerEventId: string): Promise<boolean> {
  const existing = await prisma.billingEvent.findUnique({
    where: { providerEventId },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Validate webhook envelope and subscription data; return parsed data for subscription events.
 */
export function validateWebhookPayload(envelope: unknown): {
  eventId: string;
  eventType: string;
  subscriptionData: ReturnType<typeof parseSubscriptionData>;
  metadata: { tenantId: string; planCode: "free" | "starter" | "pro" } | null;
} {
  const parsed = paddleWebhookEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new Error("Invalid webhook payload schema");
  }
  const { event_id, event_type, data } = parsed.data;
  const subscriptionData = parseSubscriptionData(data);
  const customData =
    data && typeof data === "object" && "custom_data" in data
      ? (data as { custom_data?: Record<string, unknown> }).custom_data
      : undefined;
  const metadata = parseMetadataFromCustomData(customData);
  return {
    eventId: event_id,
    eventType: event_type,
    subscriptionData,
    metadata,
  };
}

/**
 * Process a single Paddle webhook event: idempotency, tenant checks, upsert Subscription, insert BillingEvent, audit.
 * J4 only: updates Subscription, inserts BillingEvent, writes AuditLog. No usage counters, no enforcement.
 */
export async function handleWebhookEvent(params: {
  rawBody: string;
  envelope: unknown;
}): Promise<{ processed: boolean; tenantMismatch?: boolean }> {
  const { envelope } = params;
  const { eventId, eventType, subscriptionData, metadata } = validateWebhookPayload(envelope);

  if (!isSupportedPaddleEventType(eventType)) {
    return { processed: false };
  }

  if (!subscriptionData) {
    return { processed: false };
  }

  if (!metadata) {
    return { processed: false };
  }

  if (metadata.planCode === "free") {
    return { processed: false };
  }

  const tenantId = metadata.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true },
  });
  if (!tenant) {
    return { processed: false };
  }
  if (tenant.status !== "ACTIVE" && tenant.status !== "SUSPENDED") {
    return { processed: false };
  }

  const providerSubscriptionId = subscriptionData.id;
  const existingSub = await prisma.subscription.findFirst({
    where: { provider: "paddle", providerSubscriptionId },
    select: { tenantId: true, id: true },
  });
  if (existingSub && existingSub.tenantId !== tenantId) {
    return { processed: true, tenantMismatch: true };
  }

  const plan = await prisma.plan.findUnique({
    where: { code: metadata.planCode, isActive: true },
    select: { id: true },
  });
  if (!plan) {
    return { processed: false };
  }

  const status = mapPaddleStatusToInternal(subscriptionData.status);
  const period = subscriptionData.current_billing_period;
  const currentPeriodStart = period?.starts_at ? new Date(period.starts_at) : null;
  const currentPeriodEnd = period?.ends_at ? new Date(period.ends_at) : null;
  const cancelAtPeriodEnd = isCancelAtPeriodEnd(subscriptionData.scheduled_change);
  const graceUntil =
    status === "PAST_DUE" ? getGraceUntilForPastDue() : null;

  const sanitizedPayload: BillingEventSanitizedPayload = buildSanitizedPayload({
    providerEventId: eventId,
    eventType,
    subscriptionId: subscriptionData.id,
    customerId: subscriptionData.customer_id,
    status: subscriptionData.status,
    currentPeriodStart: period?.starts_at,
    currentPeriodEnd: period?.ends_at,
    tenantId,
    planCode: metadata.planCode,
    occurredAt:
      typeof (envelope as { occurred_at?: string }).occurred_at === "string"
        ? (envelope as { occurred_at: string }).occurred_at
        : undefined,
  });

  const auditAction =
    eventType === "subscription.created"
      ? "tenant.billing.subscription_created"
      : eventType === "subscription.canceled"
        ? "tenant.billing.subscription_canceled"
        : "tenant.billing.subscription_updated";

  const actorUserId = getAuditActorUserId();

  await prisma.$transaction(async (tx) => {
    const existingEvent = await tx.billingEvent.findUnique({
      where: { providerEventId: eventId },
      select: { id: true },
    });
    if (existingEvent) return;

    const existingSub = await tx.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId },
      select: { id: true, tenantId: true },
    });

    let sub: { id: string };
    if (existingSub) {
      sub = await tx.subscription.update({
        where: { id: existingSub.id },
        data: {
          planId: plan.id,
          providerCustomerId: subscriptionData.customer_id,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          graceUntil,
          cancelAtPeriodEnd,
        },
        select: { id: true },
      });
    } else {
      sub = await tx.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          provider: "paddle",
          providerCustomerId: subscriptionData.customer_id,
          providerSubscriptionId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          graceUntil,
          cancelAtPeriodEnd,
        },
        select: { id: true },
      });
    }

    await tx.billingEvent.create({
      data: {
        tenantId,
        subscriptionId: sub.id,
        type: eventType,
        providerEventId: eventId,
        payload: sanitizedPayload as unknown as object,
      },
    });

    if (actorUserId) {
      await writeAuditLog({
        actorUserId: actorUserId,
        actorContext: "VENDOR",
        tenantId,
        action: auditAction,
        targetType: "Subscription",
        targetId: sub.id,
        metadata: {
          eventId,
          eventType,
          providerSubscriptionId,
          status,
        },
      });
    }
  });

  return { processed: true };
}
