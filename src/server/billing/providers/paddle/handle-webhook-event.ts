import "server-only";

import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { logWebhookReceived } from "@/server/billing/billing-log";
import {
  isSupportedPaddleEventType,
  paddleWebhookEnvelopeSchema,
  type BillingEventSanitizedPayload,
} from "./paddle-types";
import {
  buildSanitizedPayload,
  getGraceUntilForPastDue,
  getHighestPlanCodeFromItems,
  getPlanCodeFromPriceId,
  isCancelAtPeriodEnd,
  mapPaddleStatusToInternal,
  parseMetadataFromCustomData,
  parseSubscriptionData,
} from "./map-paddle-event";
import { handleTransactionCompleted } from "./handle-transaction-completed";
import { mapAddressToProfile, type PaddleAddress } from "@/server/billing/billing-profile/sync-from-paddle";

const BILLING_WEBHOOK_ACTOR_USER_ID = process.env.BILLING_WEBHOOK_ACTOR_USER_ID;

function getAuditActorUserId(): string | null {
  return BILLING_WEBHOOK_ACTOR_USER_ID ?? null;
}

/**
 * Handle address.updated webhook: update TenantBillingProfile for the tenant that owns this customer.
 * Payload data shape matches Paddle address (id, customer_id, country_code, postal_code, first_line, second_line, city, region).
 */
async function handleAddressUpdated(envelope: {
  event_id: string;
  event_type: string;
  data: Record<string, unknown>;
}): Promise<{ processed: boolean }> {
  const { event_id: eventId, event_type: eventType, data } = envelope;
  const address = data as unknown as PaddleAddress;
  const providerCustomerId = address?.customer_id?.trim?.();
  if (!providerCustomerId || providerCustomerId.length > 191) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const sub = await prisma.subscription.findFirst({
    where: { provider: "paddle", providerCustomerId },
    select: { tenantId: true },
  });
  if (!sub) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const mapped = mapAddressToProfile(address);
  await prisma.tenantBillingProfile.upsert({
    where: { tenantId: sub.tenantId },
    create: {
      tenantId: sub.tenantId,
      countryCode: mapped.countryCode,
      postalCode: mapped.postalCode,
      region: mapped.region,
      city: mapped.city,
      addressLine1: mapped.addressLine1,
      addressLine2: mapped.addressLine2,
      companyName: null,
      vatId: null,
      providerCustomerId,
      providerAddressId: mapped.providerAddressId,
      lastSyncedAt: new Date(),
      syncSource: "webhook",
    },
    update: {
      countryCode: mapped.countryCode,
      postalCode: mapped.postalCode,
      region: mapped.region,
      city: mapped.city,
      addressLine1: mapped.addressLine1,
      addressLine2: mapped.addressLine2,
      providerAddressId: mapped.providerAddressId,
      lastSyncedAt: new Date(),
      syncSource: "webhook",
    },
  });

  logWebhookReceived({
    eventType,
    providerEventId: eventId,
    extractedTenantId: sub.tenantId,
    result: "success",
  });
  return { processed: true };
}

/** Paddle business payload (business.created / business.updated): name -> companyName, tax_identifier -> vatId. */
type PaddleBusiness = {
  id?: string;
  customer_id?: string;
  name?: string | null;
  company_number?: string | null;
  tax_identifier?: string | null;
};

/**
 * Handle business.created / business.updated: sync company name and VAT ID to TenantBillingProfile.
 * Payload: customer_id, name (company name), tax_identifier (VAT/Tax ID).
 */
async function handleBusinessCreatedOrUpdated(envelope: {
  event_id: string;
  event_type: string;
  data: Record<string, unknown>;
}): Promise<{ processed: boolean }> {
  const { event_id: eventId, event_type: eventType, data } = envelope;
  const business = data as unknown as PaddleBusiness;
  const providerCustomerId = business?.customer_id?.trim?.();
  if (!providerCustomerId || providerCustomerId.length > 191) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const sub = await prisma.subscription.findFirst({
    where: { provider: "paddle", providerCustomerId },
    select: { tenantId: true },
  });
  if (!sub) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const companyName = business.name?.trim?.()?.slice(0, 160) ?? null;
  const vatId = business.tax_identifier?.trim?.()?.slice(0, 64) ?? null;

  await prisma.tenantBillingProfile.upsert({
    where: { tenantId: sub.tenantId },
    create: {
      tenantId: sub.tenantId,
      countryCode: "US",
      postalCode: null,
      region: null,
      city: null,
      addressLine1: null,
      addressLine2: null,
      companyName,
      vatId,
      providerCustomerId,
      providerBusinessId: business.id?.slice(0, 191) ?? null,
      lastSyncedAt: new Date(),
      syncSource: "webhook",
    },
    update: {
      companyName: companyName ?? undefined,
      vatId: vatId ?? undefined,
      providerBusinessId: business.id?.slice(0, 191) ?? undefined,
      lastSyncedAt: new Date(),
      syncSource: "webhook",
    },
  });

  logWebhookReceived({
    eventType,
    providerEventId: eventId,
    extractedTenantId: sub.tenantId,
    result: "success",
  });
  return { processed: true };
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
  metadata: { tenantId: string; planCode: "free" | "starter" | "pro" | "enterprise" } | null;
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

  const envelopeParsed = paddleWebhookEnvelopeSchema.safeParse(envelope);
  if (!envelopeParsed.success) {
    throw new Error("Invalid webhook payload schema");
  }
  const { event_id: eventId, event_type: eventType } = envelopeParsed.data;

  if (eventType === "transaction.completed") {
    const result = await handleTransactionCompleted(envelope);
    return { processed: result.processed };
  }

  if (eventType === "address.updated") {
    const result = await handleAddressUpdated(envelopeParsed.data);
    return { processed: result.processed };
  }

  if (eventType === "business.created" || eventType === "business.updated") {
    const result = await handleBusinessCreatedOrUpdated(envelopeParsed.data);
    return { processed: result.processed };
  }

  const { subscriptionData, metadata } = validateWebhookPayload(envelope);

  if (!isSupportedPaddleEventType(eventType)) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  if (!subscriptionData) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const providerSubscriptionId = subscriptionData.id;

  if (eventType === "subscription.canceled") {
    const existingSub = await prisma.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId },
      select: { id: true, tenantId: true },
    });
    if (existingSub) {
      const freePlan = await prisma.plan.findUnique({
        where: { code: "free", isActive: true },
        select: { id: true },
      });
      if (freePlan) {
        await prisma.subscription.update({
          where: { id: existingSub.id },
          data: {
            status: "CANCELED",
            planId: freePlan.id,
            pendingPlanCode: null,
            cancelAtPeriodEnd: false,
          },
        });
        const actorUserId = getAuditActorUserId();
        if (actorUserId) {
          await writeAuditLog({
            actorUserId,
            actorContext: "VENDOR",
            tenantId: existingSub.tenantId,
            action: "tenant.billing.subscription_canceled",
            targetType: "Subscription",
            targetId: existingSub.id,
            metadata: { providerSubscriptionId, eventId },
          });
        }
      }
    }
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      result: "success",
    });
    return { processed: true };
  }

  let resolvedMetadata = metadata;
  if (!resolvedMetadata) {
    const planCodeFromItems = getHighestPlanCodeFromItems(subscriptionData.items);
    const existingBySub = await prisma.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId },
      select: { tenantId: true },
    });
    if (existingBySub && planCodeFromItems && planCodeFromItems !== "free") {
      resolvedMetadata = { tenantId: existingBySub.tenantId, planCode: planCodeFromItems };
    }
  }

  if (!resolvedMetadata) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      result: "ignored",
    });
    return { processed: false };
  }

  if (resolvedMetadata.planCode === "free") {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      extractedTenantId: resolvedMetadata.tenantId,
      extractedPlanCode: resolvedMetadata.planCode,
      result: "ignored",
    });
    return { processed: false };
  }

  const tenantId = resolvedMetadata.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true },
  });
  if (!tenant) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      extractedTenantId: tenantId,
      extractedPlanCode: resolvedMetadata.planCode,
      result: "ignored",
    });
    return { processed: false };
  }
  if (tenant.status !== "ACTIVE" && tenant.status !== "SUSPENDED") {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      extractedTenantId: tenantId,
      extractedPlanCode: resolvedMetadata.planCode,
      result: "ignored",
    });
    return { processed: false };
  }

  const existingSub = await prisma.subscription.findFirst({
    where: { provider: "paddle", providerSubscriptionId },
    select: { tenantId: true, id: true },
  });
  if (existingSub && existingSub.tenantId !== tenantId) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      extractedTenantId: tenantId,
      extractedPlanCode: resolvedMetadata.planCode,
      result: "tenant_mismatch",
    });
    return { processed: true, tenantMismatch: true };
  }

  const planCodeFromItems = getHighestPlanCodeFromItems(subscriptionData.items);
  const hasScheduledChange = !!(
    subscriptionData.scheduled_change &&
    typeof subscriptionData.scheduled_change === "object"
  );
  const effectivePlanCode =
    !hasScheduledChange && planCodeFromItems && planCodeFromItems !== "free"
      ? planCodeFromItems
      : resolvedMetadata.planCode;

  const plan = await prisma.plan.findUnique({
    where: { code: effectivePlanCode, isActive: true },
    select: { id: true },
  });
  if (!plan) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      providerSubscriptionId,
      extractedTenantId: tenantId,
      extractedPlanCode: effectivePlanCode,
      result: "ignored",
    });
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
    planCode: effectivePlanCode,
    occurredAt:
      typeof (envelope as { occurred_at?: string }).occurred_at === "string"
        ? (envelope as { occurred_at: string }).occurred_at
        : undefined,
  });

  const auditAction =
    eventType === "subscription.created"
      ? "tenant.billing.subscription_created"
      : "tenant.billing.subscription_updated";

  const actorUserId = getAuditActorUserId();

  await prisma.$transaction(async (tx) => {
    let existingSub = await tx.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId },
      select: { id: true, tenantId: true, pendingPlanCode: true },
    });
    if (!existingSub) {
      existingSub = await tx.subscription.findFirst({
        where: { tenantId, provider: "paddle" },
        orderBy: { currentPeriodEnd: "desc" },
        select: { id: true, tenantId: true, pendingPlanCode: true },
      }) ?? undefined;
    }

    const clearPending =
      existingSub?.pendingPlanCode != null && existingSub.pendingPlanCode === effectivePlanCode;

    let sub: { id: string };
    if (existingSub) {
      sub = await tx.subscription.update({
        where: { id: existingSub.id },
        data: {
          planId: plan.id,
          providerCustomerId: subscriptionData.customer_id,
          providerSubscriptionId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          graceUntil,
          cancelAtPeriodEnd,
          ...(clearPending ? { pendingPlanCode: null } : {}),
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

  logWebhookReceived({
    eventType,
    providerEventId: eventId,
    providerSubscriptionId,
    extractedTenantId: tenantId,
    extractedPlanCode: resolvedMetadata.planCode,
    result: "success",
  });

  return { processed: true };
}
