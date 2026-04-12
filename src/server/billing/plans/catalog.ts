import "server-only";

export type ServerPlanCode = "free" | "starter" | "pro" | "scale";

export type PlanCatalogEntry = {
  code: ServerPlanCode;
  priceMonthly: number; // cents
  priceYearly: number; // cents
  requestsIncluded: number; // -1 = unlimited
  hardCap: boolean;
  rolloverMaxAvailable: number;
  rolloverExpiryDays: number;
  overageCentsPerRequest: number | null;
  proSoftCapRequests: number | null;
  pdfIncluded: number; // -1 = unlimited
  pdfHardCap: boolean;
  pdfWatermark: boolean;
  zipEnabled: boolean;
  membersLimit: number; // -1 = unlimited
  auditRetentionDays: number;
  emailBranding: "powered_by" | "removed";
  storageLimitGb: number;
};

export const PLAN_CATALOG: Record<ServerPlanCode, PlanCatalogEntry> = {
  free: {
    code: "free",
    priceMonthly: 0,
    priceYearly: 0,
    requestsIncluded: 35,
    hardCap: true,
    rolloverMaxAvailable: 35,
    rolloverExpiryDays: 0,
    overageCentsPerRequest: null,
    proSoftCapRequests: null,
    pdfIncluded: 3,
    pdfHardCap: true,
    pdfWatermark: true,
    zipEnabled: false,
    membersLimit: 5,
    auditRetentionDays: 30,
    emailBranding: "powered_by",
    storageLimitGb: 1,
  },
  starter: {
    code: "starter",
    priceMonthly: 4900,
    priceYearly: 49900,
    requestsIncluded: -1,
    hardCap: false,
    rolloverMaxAvailable: -1,
    rolloverExpiryDays: 0,
    overageCentsPerRequest: null,
    proSoftCapRequests: null,
    pdfIncluded: 25,
    pdfHardCap: true,
    pdfWatermark: false,
    zipEnabled: false,
    membersLimit: 15,
    auditRetentionDays: 90,
    emailBranding: "powered_by",
    storageLimitGb: 20,
  },
  pro: {
    code: "pro",
    priceMonthly: 9900,
    priceYearly: 100900,
    requestsIncluded: -1,
    hardCap: false,
    rolloverMaxAvailable: -1,
    rolloverExpiryDays: 0,
    overageCentsPerRequest: null,
    proSoftCapRequests: null,
    pdfIncluded: -1,
    pdfHardCap: false,
    pdfWatermark: false,
    zipEnabled: true,
    membersLimit: 80,
    auditRetentionDays: 365,
    emailBranding: "removed",
    storageLimitGb: 100,
  },
  scale: {
    code: "scale",
    priceMonthly: 24900,
    priceYearly: 202900,
    requestsIncluded: -1,
    hardCap: false,
    rolloverMaxAvailable: -1,
    rolloverExpiryDays: 0,
    overageCentsPerRequest: null,
    proSoftCapRequests: null,
    pdfIncluded: -1,
    pdfHardCap: false,
    pdfWatermark: false,
    zipEnabled: true,
    membersLimit: -1,
    auditRetentionDays: 1095,
    emailBranding: "removed",
    storageLimitGb: 500,
  },
};

export function getPlanCatalogEntry(code: string): PlanCatalogEntry | undefined {
  const normalized = code?.toLowerCase();
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "pro" ||
    normalized === "scale"
  ) {
    return PLAN_CATALOG[normalized as ServerPlanCode];
  }
  return undefined;
}
