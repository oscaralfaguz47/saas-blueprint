import "server-only";

/**
 * Provider-neutral billing types. Provider-specific logic lives in checkout/webhook epics.
 * Billing core never trusts provider webhook state; effective plan from Subscription + Plan.
 */
export type BillingProvider = "paddle" | "stripe" | "manual";

/** Plan code canonical set (J1 Workspace Billing Core). */
export type PlanCode = "free" | "starter" | "pro";

/** Parsed limits for requests meter from Plan.featuresJson. */
export type RequestsLimits = {
  included: number;
  hardCap: boolean;
  rolloverMonths: number;
  maxAvailable: number;
  overageCentsPerUnit: number | null;
  overageCapCents: number | null;
};

/** Parsed limits for PDF exports from Plan.featuresJson. */
export type PdfLimits = {
  included: number; // -1 = unlimited
  hardCap: boolean;
  watermark: boolean;
};

/** Parsed limits for ZIP exports (boolean = feature on/off). */
export type ZipLimits = {
  enabled: boolean;
};

/** Full plan features shape from featuresJson. */
export type PlanFeatures = {
  requests: RequestsLimits;
  pdf: PdfLimits;
  zip: ZipLimits;
  search: boolean;
  manualReminders: boolean;
  paymentStatus: boolean;
  auditLog: "basic" | "full" | number; // number = days for starter
};
