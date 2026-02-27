import "server-only";

/**
 * Canonical plan codes (EPIC 5).
 */
export type ServerPlanCode = "free" | "starter" | "pro" | "enterprise";

export type PlanCatalogEntry = {
  code: ServerPlanCode;
  /** Requests included per period. */
  requestsIncluded: number;
  hardCap: boolean;
  /** Rollover: paid only. Cap on max available (included + rollover). */
  rolloverMaxAvailable: number;
  /** Rollover expiry in days (0 = no rollover). */
  rolloverExpiryDays: number;
  /** Overage cents per request (null = no overage billing). */
  overageCentsPerRequest: number | null;
  /** Pro: soft cap for fair-use monitoring (no billing). */
  proSoftCapRequests: number | null;
  pdfIncluded: number;
  pdfHardCap: boolean;
  pdfWatermark: boolean;
  zipEnabled: boolean;
};

export const PLAN_CATALOG: Record<ServerPlanCode, PlanCatalogEntry> = {
  free: {
    code: "free",
    requestsIncluded: 10,
    hardCap: true,
    rolloverMaxAvailable: 10,
    rolloverExpiryDays: 0,
    overageCentsPerRequest: null,
    proSoftCapRequests: null,
    pdfIncluded: 1,
    pdfHardCap: true,
    pdfWatermark: true,
    zipEnabled: false,
  },
  starter: {
    code: "starter",
    requestsIncluded: 200,
    hardCap: false,
    rolloverMaxAvailable: 400,
    rolloverExpiryDays: 60,
    overageCentsPerRequest: 25, // $0.25
    proSoftCapRequests: null,
    pdfIncluded: 50,
    pdfHardCap: true,
    pdfWatermark: false,
    zipEnabled: true,
  },
  pro: {
    code: "pro",
    requestsIncluded: 2000,
    hardCap: false,
    rolloverMaxAvailable: 2000,
    rolloverExpiryDays: 60,
    overageCentsPerRequest: null,
    proSoftCapRequests: 2000,
    pdfIncluded: -1,
    pdfHardCap: false,
    pdfWatermark: false,
    zipEnabled: true,
  },
  enterprise: {
    code: "enterprise",
    requestsIncluded: 4000,
    hardCap: true,
    rolloverMaxAvailable: 4000,
    rolloverExpiryDays: 0,
    overageCentsPerRequest: null,
    proSoftCapRequests: null,
    pdfIncluded: -1,
    pdfHardCap: false,
    pdfWatermark: false,
    zipEnabled: true,
  },
};

export function getPlanCatalogEntry(
  code: string
): PlanCatalogEntry | undefined {
  const normalized = code?.toLowerCase();
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "pro" ||
    normalized === "enterprise"
  ) {
    return PLAN_CATALOG[normalized as ServerPlanCode];
  }
  return undefined;
}
