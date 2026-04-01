import "server-only";

import { prisma } from "@/server/db";
import type { PlanCode, PlanFeatures, RequestsLimits } from "./provider-types";
import {
  resolveEffectiveSubscription,
  type EffectiveSubscription,
} from "./resolve-effective-subscription";
import { getPlanCatalogEntry } from "./plans/catalog";

export type ResolvedTenantPlan = {
  planCode: PlanCode | string;
  features: PlanFeatures;
  /** Resolved limits for REQUESTS meter (convenience). */
  requestsLimits: RequestsLimits;
  subscriptionStatus: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanCode: string | null;
  pendingChangeType: string | null;
  entitlementEffectiveUntil: Date | null;
  paymentStatus: string | null;
  graceEndsAt: Date | null;
  pastDueSince: Date | null;
  isBlocked: boolean;
};

const DEFAULT_FREE_FEATURES: PlanFeatures = {
  requests: {
    included: 10,
    hardCap: true,
    rolloverMonths: 0,
    maxAvailable: 10,
    overageCentsPerUnit: null,
    overageCapCents: null,
  },
  pdf: { included: 1, hardCap: true, watermark: true },
  zip: { enabled: false },
  search: false,
  manualReminders: false,
  paymentStatus: false,
  auditLog: "basic",
};

/** Build PlanFeatures from server plan catalog (EPIC 5 canonical). */
function featuresFromCatalog(entry: import("./plans/catalog").PlanCatalogEntry): PlanFeatures {
  const rolloverMonths = entry.rolloverExpiryDays > 0 ? 1 : 0;
  return {
    requests: {
      included: entry.requestsIncluded,
      hardCap: entry.hardCap,
      rolloverMonths,
      maxAvailable: entry.rolloverMaxAvailable,
      overageCentsPerUnit: entry.overageCentsPerRequest,
      overageCapCents: null,
    },
    pdf: {
      included: entry.pdfIncluded < 0 ? -1 : entry.pdfIncluded,
      hardCap: entry.pdfHardCap,
      watermark: entry.pdfWatermark,
    },
    zip: { enabled: entry.zipEnabled },
    search: entry.code !== "free",
    manualReminders: entry.code !== "free",
    paymentStatus: entry.code !== "free",
    auditLog: entry.code === "free" ? "basic" : "full",
  };
}

function parseFeaturesJson(featuresJson: unknown): PlanFeatures {
  if (!featuresJson || typeof featuresJson !== "object") {
    return DEFAULT_FREE_FEATURES;
  }
  const raw = featuresJson as Record<string, unknown>;
  const req = raw.requests as Record<string, unknown> | undefined;
  const pdf = raw.pdf as Record<string, unknown> | undefined;
  const zip = raw.zip as Record<string, unknown> | undefined;
  return {
    requests: {
      included: typeof req?.included === "number" ? req.included : 10,
      hardCap: req?.hardCap !== false,
      rolloverMonths: typeof req?.rolloverMonths === "number" ? req.rolloverMonths : 0,
      maxAvailable: typeof req?.maxAvailable === "number" ? req.maxAvailable : 10,
      overageCentsPerUnit:
        typeof req?.overageCentsPerUnit === "number" ? req.overageCentsPerUnit : null,
      overageCapCents:
        typeof req?.overageCapCents === "number" ? req.overageCapCents : null,
    },
    pdf: {
      included: typeof pdf?.included === "number" ? pdf.included : 1,
      hardCap: pdf?.hardCap !== false,
      watermark: pdf?.watermark === true,
    },
    zip: { enabled: zip?.enabled === true },
    search: raw.search === true,
    manualReminders: raw.manualReminders === true,
    paymentStatus: raw.paymentStatus === true,
    auditLog:
      typeof raw.auditLog === "number"
        ? raw.auditLog
        : raw.auditLog === "full"
          ? "full"
          : "basic",
  };
}

/**
 * Resolve plan and limits for a tenant. Uses effective subscription; if no subscription,
 * falls back to free plan. Request-scoped caching is safe for same tenantId.
 * Pass `cachedEffective` when the caller already called `resolveEffectiveSubscription` for this tenant.
 */
export async function resolveTenantPlan(
  tenantId: string,
  cachedEffective?: EffectiveSubscription | null
): Promise<ResolvedTenantPlan> {
  const effective =
    cachedEffective !== undefined
      ? cachedEffective
      : await resolveEffectiveSubscription(tenantId);

  if (!effective) {
    return {
      planCode: "free",
      features: DEFAULT_FREE_FEATURES,
      requestsLimits: DEFAULT_FREE_FEATURES.requests,
      subscriptionStatus: "none",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceUntil: null,
      cancelAtPeriodEnd: false,
      pendingPlanCode: null,
      pendingChangeType: null,
      entitlementEffectiveUntil: null,
      paymentStatus: null,
      graceEndsAt: null,
      pastDueSince: null,
      isBlocked: false,
    };
  }

  /** Use entitlement plan code for features; look up by code so downgrade-pending keeps higher plan features until period end. */
  const planCode = (effective.planCode ?? "free").toLowerCase() as PlanCode | string;
  const plan = await prisma.plan.findFirst({
    where: { code: { equals: planCode, mode: "insensitive" }, isActive: true },
    select: { code: true, featuresJson: true },
  });
  const catalogEntry = getPlanCatalogEntry(planCode);
  const features = catalogEntry
    ? featuresFromCatalog(catalogEntry)
    : plan
      ? parseFeaturesJson(plan.featuresJson)
      : DEFAULT_FREE_FEATURES;

  return {
    planCode,
    features,
    requestsLimits: features.requests,
    subscriptionStatus: effective.status,
    currentPeriodStart: effective.currentPeriodStart,
    currentPeriodEnd: effective.currentPeriodEnd,
    graceUntil: effective.graceUntil,
    cancelAtPeriodEnd: effective.cancelAtPeriodEnd,
    pendingPlanCode: effective.pendingPlanCode,
    pendingChangeType: effective.pendingChangeType,
    entitlementEffectiveUntil: effective.entitlementEffectiveUntil,
    paymentStatus: effective.paymentStatus,
    graceEndsAt: effective.graceEndsAt,
    pastDueSince: effective.pastDueSince,
    isBlocked: effective.isBlocked,
  };
}
