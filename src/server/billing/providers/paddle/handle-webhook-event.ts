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
import { handleTransactionCompleted, handleTransactionUpdated } from "./handle-transaction-completed";
import { fetchPaddleSubscription } from "./fetch-subscription";
import { setPaddleAddressDescription } from "@/server/billing/paddle/customer/update-billing-details";
import { PADDLE_API_BASE, getPaddleApiKey } from "@/server/billing/paddle/paddle-api";
import { mapAddressToProfile, type PaddleAddress } from "@/server/billing/billing-profile/sync-from-paddle";
import { env } from "@/lib/env";

const BILLING_WEBHOOK_ACTOR_USER_ID = env.BILLING_WEBHOOK_ACTOR_USER_ID;

function getAuditActorUserId(): string | null {
  return BILLING_WEBHOOK_ACTOR_USER_ID ?? null;
}

/**
 * Resolve tenantId for a Paddle customer_id. Tries (1) Subscription by providerCustomerId,
 * (2) TenantBillingProfile by providerCustomerId, (3) Paddle API list subscriptions by customer_id
 * then our Subscription by providerSubscriptionId (and backfill providerCustomerId).
 */
async function resolveTenantIdByProviderCustomerId(providerCustomerId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { provider: "paddle", providerCustomerId },
    select: { tenantId: true },
  });
  if (sub) return sub.tenantId;
  const profile = await prisma.tenantBillingProfile.findFirst({
    where: { providerCustomerId },
    select: { tenantId: true },
  });
  if (profile) return profile.tenantId;

  // Fallback: fetch subscriptions from Paddle for this customer, match by providerSubscriptionId, backfill providerCustomerId
  try {
    const url = new URL(`${PADDLE_API_BASE}/subscriptions`);
    url.searchParams.set("customer_id", providerCustomerId);
    url.searchParams.set("per_page", "10");
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const firstId = json?.data?.[0]?.id;
    if (!firstId || typeof firstId !== "string") return null;
    const ourSub = await prisma.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId: firstId },
      select: { tenantId: true, id: true },
    });
    if (!ourSub) return null;
    await prisma.subscription.update({
      where: { id: ourSub.id },
      data: { providerCustomerId },
    });
    return ourSub.tenantId;
  } catch {
    return null;
  }
}

/**
 * Resolve tenantId for a Paddle business_id when the customer has multiple businesses/subscriptions.
 * Fetches subscriptions for the customer from Paddle and finds the one whose business_id matches, then our Subscription by providerSubscriptionId.
 */
async function resolveTenantIdByProviderBusinessId(
  providerCustomerId: string,
  providerBusinessId: string
): Promise<string | null> {
  if (!providerBusinessId || providerBusinessId.length > 191) return null;
  try {
    const url = new URL(`${PADDLE_API_BASE}/subscriptions`);
    url.searchParams.set("customer_id", providerCustomerId);
    url.searchParams.set("per_page", "50");
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${getPaddleApiKey()}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ id?: string; business_id?: string | null }> };
    const list = json?.data ?? [];
    const subscriptionId = list.find((s) => s.business_id === providerBusinessId)?.id;
    if (!subscriptionId || typeof subscriptionId !== "string") return null;
    const ourSub = await prisma.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId: subscriptionId },
      select: { tenantId: true },
    });
    return ourSub?.tenantId ?? null;
  } catch {
    return null;
  }
}

/**
 * Handle address.created / address.updated webhook: sync TenantBillingProfile for the tenant that owns this customer.
 * When a Paddle admin creates or updates an address in the Paddle dashboard, we reflect it in our DB.
 * Payload data shape matches Paddle address (id, customer_id, country_code, postal_code, first_line, second_line, city, region).
 */
async function handleAddressCreatedOrUpdated(envelope: {
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

  // Prefer subscription ID from address description (we set it to sub_xxx) so we resolve the correct tenant when a customer has multiple subscriptions.
  const description = address?.description?.trim?.();
  const subscriptionIdFromDescription =
    description && description.startsWith("sub_") && description.length >= 10 && description.length <= 191
      ? description
      : null;
  let tenantId: string | null = null;
  if (subscriptionIdFromDescription) {
    const subByDescription = await prisma.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId: subscriptionIdFromDescription },
      select: { tenantId: true },
    });
    if (subByDescription) tenantId = subByDescription.tenantId;
  }
  if (!tenantId) {
    tenantId = await resolveTenantIdByProviderCustomerId(providerCustomerId);
  }
  if (!tenantId) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const mapped = mapAddressToProfile(address);
  await prisma.tenantBillingProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
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
    extractedTenantId: tenantId,
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

  // Resolve tenant by subscription that uses this business (customer can have multiple businesses/subscriptions).
  const providerBusinessId = business?.id?.trim?.();
  let tenantId: string | null = null;
  if (providerBusinessId) {
    tenantId = await resolveTenantIdByProviderBusinessId(providerCustomerId, providerBusinessId);
  }
  if (!tenantId) {
    tenantId = await resolveTenantIdByProviderCustomerId(providerCustomerId);
  }
  if (!tenantId) {
    logWebhookReceived({
      eventType,
      providerEventId: eventId,
      result: "ignored",
    });
    return { processed: false };
  }

  const companyName = business.name?.trim?.()?.slice(0, 160) ?? null;
  const vatId = business.tax_identifier?.trim?.()?.slice(0, 64) ?? null;
  const hasMeaningfulBusiness = !!(companyName || vatId);
  const providerBusinessIdToStore = hasMeaningfulBusiness ? (business.id?.slice(0, 191) ?? null) : null;

  await prisma.tenantBillingProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      countryCode: "US",
      postalCode: null,
      region: null,
      city: null,
      addressLine1: null,
      addressLine2: null,
      companyName: hasMeaningfulBusiness ? companyName : null,
      vatId: hasMeaningfulBusiness ? vatId : null,
      providerCustomerId,
      providerBusinessId: providerBusinessIdToStore,
      lastSyncedAt: new Date(),
      syncSource: "webhook",
    },
    update: {
      companyName: hasMeaningfulBusiness ? companyName : null,
      vatId: hasMeaningfulBusiness ? vatId : null,
      providerBusinessId: providerBusinessIdToStore,
      lastSyncedAt: new Date(),
      syncSource: "webhook",
    },
  });

  logWebhookReceived({
    eventType,
    providerEventId: eventId,
    extractedTenantId: tenantId,
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

  if (eventType === "transaction.updated") {
    const result = await handleTransactionUpdated(envelope);
    return { processed: result.processed };
  }

  if (eventType === "address.created" || eventType === "address.updated") {
    const result = await handleAddressCreatedOrUpdated(envelopeParsed.data);
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

  // Use authoritative state from Paddle to avoid stale/partial webhook payloads (e.g. upgrade showing old plan).
  let authoritativeData: typeof subscriptionData | null = null;
  try {
    authoritativeData = await fetchPaddleSubscription(providerSubscriptionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[handleWebhookEvent] Re-fetch subscription failed; using webhook payload", {
      eventType,
      providerSubscriptionId,
      error: msg.slice(0, 200),
    });
  }
  const dataToUse = authoritativeData ?? subscriptionData;

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
    const planCodeFromItems = getHighestPlanCodeFromItems(dataToUse.items);
    const existingBySub = await prisma.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId },
      select: { tenantId: true, plan: { select: { code: true } }, currentEntitlementPlanCode: true },
    });
    if (existingBySub) {
      // Use plan code from items, or fall back to current entitlement/plan in DB.
      // This ensures cancellation webhooks from Paddle dashboard are processed even
      // when price IDs don't match env vars or custom_data is missing.
      const planCode =
        planCodeFromItems && planCodeFromItems !== "free"
          ? planCodeFromItems
          : (existingBySub.currentEntitlementPlanCode ?? existingBySub.plan?.code ?? null);
      if (planCode && planCode !== "free") {
        resolvedMetadata = {
          tenantId: existingBySub.tenantId,
          planCode: planCode as "starter" | "pro" | "enterprise",
        };
      }
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

  // Billing plan = what Paddle has on subscription items (authoritative from re-fetch when available).
  const planCodeFromItems = getHighestPlanCodeFromItems(dataToUse.items);
  const newBillingPlanCode = (planCodeFromItems ?? resolvedMetadata.planCode ?? "free").toLowerCase();
  const hasScheduledChange = !!(
    dataToUse.scheduled_change &&
    typeof dataToUse.scheduled_change === "object"
  );
  const effectivePlanCode =
    planCodeFromItems && planCodeFromItems !== "free"
      ? planCodeFromItems
      : resolvedMetadata.planCode;

  const status = mapPaddleStatusToInternal(dataToUse.status);
  const period = dataToUse.current_billing_period;
  const currentPeriodStart = period?.starts_at ? new Date(period.starts_at) : null;
  const currentPeriodEnd = period?.ends_at ? new Date(period.ends_at) : null;
  const cancelAtPeriodEnd = isCancelAtPeriodEnd(dataToUse.scheduled_change);
  const graceUntil =
    status === "PAST_DUE" ? getGraceUntilForPastDue() : null;

  const PLAN_TIER: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
  function planTier(code: string): number {
    return PLAN_TIER[code?.toLowerCase()] ?? -1;
  }

  const sanitizedPayload: BillingEventSanitizedPayload = buildSanitizedPayload({
    providerEventId: eventId,
    eventType,
    subscriptionId: dataToUse.id,
    customerId: dataToUse.customer_id,
    status: dataToUse.status,
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
  const periodEnd = currentPeriodEnd ?? null;

  await prisma.$transaction(async (tx) => {
    let existingSub = await tx.subscription.findFirst({
      where: { provider: "paddle", providerSubscriptionId },
      select: {
        id: true,
        tenantId: true,
        pendingPlanCode: true,
        planId: true,
        downgradePaddleAppliedAt: true,
        currentEntitlementPlanCode: true,
        billingPlanCode: true,
        pendingChangeType: true,
        pendingEffectiveAt: true,
        entitlementEffectiveUntil: true,
        pastDueSince: true,
        graceEndsAt: true,
        plan: { select: { code: true } },
      },
    });
    if (!existingSub) {
      existingSub =
        (await tx.subscription.findFirst({
          where: { tenantId, provider: "paddle" },
          orderBy: { currentPeriodEnd: "desc" },
          select: {
            id: true,
            tenantId: true,
            pendingPlanCode: true,
            planId: true,
            downgradePaddleAppliedAt: true,
            currentEntitlementPlanCode: true,
            billingPlanCode: true,
            pendingChangeType: true,
            pendingEffectiveAt: true,
            entitlementEffectiveUntil: true,
            pastDueSince: true,
            graceEndsAt: true,
            plan: { select: { code: true } },
          },
        })) ?? null;
    }

    const previousEntitlement = (existingSub?.currentEntitlementPlanCode ?? existingSub?.plan?.code ?? newBillingPlanCode).toLowerCase();
    const newBilling = newBillingPlanCode === "free" ? "free" : newBillingPlanCode;

    let entitlementCode: string;
    let billingCode: string;
    let pendingChangeType: string | null;
    let pendingPlanCode: string | null;
    let pendingEffectiveAt: Date | null;
    let entitlementEffectiveUntil: Date | null;

    if (cancelAtPeriodEnd) {
      // A) Scheduled cancellation to free: keep paid until period end
      billingCode = newBilling === "free" ? previousEntitlement : newBilling;
      entitlementCode = newBilling === "free" ? previousEntitlement : newBilling;
      pendingChangeType = "cancel_to_free_end_of_period";
      pendingPlanCode = "free";
      pendingEffectiveAt = periodEnd;
      entitlementEffectiveUntil = periodEnd;
    } else if (existingSub?.pendingChangeType && existingSub.pendingEffectiveAt && currentPeriodStart && currentPeriodStart >= existingSub.pendingEffectiveAt) {
      // D) Renewal boundary: apply pending change
      entitlementCode = (existingSub.pendingPlanCode ?? newBilling).toLowerCase();
      billingCode = newBilling;
      pendingChangeType = null;
      pendingPlanCode = null;
      pendingEffectiveAt = null;
      entitlementEffectiveUntil = null;
    } else if (planTier(newBilling) > planTier(previousEntitlement)) {
      // C) Upgrade: switch entitlements immediately
      entitlementCode = newBilling;
      billingCode = newBilling;
      pendingChangeType = null;
      pendingPlanCode = null;
      pendingEffectiveAt = null;
      entitlementEffectiveUntil = null;
    } else if (planTier(newBilling) < planTier(previousEntitlement) && newBilling !== "free") {
      // B) Paid->paid downgrade: billing changes now, entitlements stay until period end
      entitlementCode = previousEntitlement;
      billingCode = newBilling;
      pendingChangeType = "downgrade_end_of_period";
      pendingPlanCode = newBilling;
      pendingEffectiveAt = periodEnd;
      entitlementEffectiveUntil = periodEnd;
    } else {
      entitlementCode = newBilling;
      billingCode = newBilling;
      // If Paddle no longer has a scheduled change (scheduled_change is null),
      // clear any pending cancellation or downgrade we have stored.
      // This handles the case where a user or admin reverts a scheduled cancellation
      // from the Paddle dashboard ("Don't cancel subscription").
      const hasScheduledChangeinPaddle = !!(
        dataToUse.scheduled_change &&
        typeof dataToUse.scheduled_change === "object" &&
        dataToUse.scheduled_change.action
      );
      if (!hasScheduledChangeinPaddle) {
        pendingChangeType = null;
        pendingPlanCode = null;
        pendingEffectiveAt = null;
        entitlementEffectiveUntil = null;
      } else {
        pendingChangeType = existingSub?.pendingChangeType ?? null;
        pendingPlanCode = existingSub?.pendingPlanCode ?? null;
        pendingEffectiveAt = existingSub?.pendingEffectiveAt ?? null;
        entitlementEffectiveUntil = existingSub?.entitlementEffectiveUntil ?? null;
      }
    }

    const entitlementPlan = await tx.plan.findFirst({
      where: { code: { equals: entitlementCode, mode: "insensitive" }, isActive: true },
      select: { id: true },
    });
    if (!entitlementPlan) {
      console.warn("[handleWebhookEvent] Plan not found for entitlement code; subscription not updated", {
        eventType,
        providerEventId: eventId,
        providerSubscriptionId,
        tenantId,
        entitlementCode,
        newBillingPlanCode,
        previousEntitlement,
      });
      logWebhookReceived({
        eventType,
        providerEventId: eventId,
        providerSubscriptionId,
        extractedTenantId: tenantId,
        extractedPlanCode: entitlementCode,
        result: "ignored",
      });
      return;
    }

    const now = new Date();
    const sevenDaysFromNow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    })();
    const paymentFields =
      status === "PAST_DUE"
        ? {
            paymentStatus: "past_due" as const,
            pastDueSince: existingSub?.pastDueSince ?? now,
            graceEndsAt: existingSub?.graceEndsAt ?? sevenDaysFromNow,
          }
        : {
            paymentStatus: "healthy" as const,
            pastDueSince: null as Date | null,
            graceEndsAt: null as Date | null,
            lastPaymentFailureCode: null as string | null,
            lastPaymentFailureMessage: null as string | null,
          };

    const baseData = {
      providerCustomerId: dataToUse.customer_id,
      providerSubscriptionId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      graceUntil,
      cancelAtPeriodEnd,
      planId: entitlementPlan.id,
      billingPlanCode: billingCode,
      currentEntitlementPlanCode: entitlementCode,
      entitlementEffectiveUntil,
      pendingChangeType,
      pendingPlanCode,
      pendingEffectiveAt,
      ...paymentFields,
    };

    let sub: { id: string };
    if (existingSub) {
      sub = await tx.subscription.update({
        where: { id: existingSub.id },
        data: baseData,
        select: { id: true },
      });
    } else {
      try {
        sub = await tx.subscription.create({
          data: {
            tenantId,
            provider: "paddle",
            ...baseData,
          },
          select: { id: true },
        });
      } catch (createErr: unknown) {
        const code = (createErr as { code?: string })?.code;
        if (code === "P2002") {
          const byTenantProvider = await tx.subscription.findUnique({
            where: { tenantId_provider: { tenantId, provider: "paddle" } },
            select: { id: true },
          });
          if (byTenantProvider) {
            sub = await tx.subscription.update({
              where: { id: byTenantProvider.id },
              data: baseData,
              select: { id: true },
            });
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }
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

  if (
    (eventType === "subscription.created" || eventType === "subscription.updated") &&
    dataToUse.address_id &&
    dataToUse.customer_id
  ) {
    try {
      await setPaddleAddressDescription(
        dataToUse.customer_id,
        dataToUse.address_id,
        dataToUse.id
      );
    } catch {
      // Non-blocking: subscription was saved; address description is best-effort
    }
  }

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
