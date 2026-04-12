import "server-only";

export type BillingProvider = "paddle" | "stripe" | "manual";

/** Canonical plan codes. */
export type PlanCode = "free" | "starter" | "pro" | "scale";

/** Email branding behavior on outgoing emails. */
export type EmailBranding = "powered_by" | "removed";

export type BillingInterval = "monthly" | "annual";

export type RequestsLimits = {
  included: number; // -1 = unlimited
  hardCap: boolean;
  rolloverMonths: number;
  maxAvailable: number;
  overageCentsPerUnit: number | null;
  overageCapCents: number | null;
};

export type PdfLimits = {
  included: number; // -1 = unlimited
  hardCap: boolean;
  watermark: boolean;
};

export type ZipLimits = {
  enabled: boolean;
};

export type PlanFeatures = {
  requests: RequestsLimits;
  pdf: PdfLimits;
  zip: ZipLimits;
  search: boolean;
  manualReminders: boolean;
  paymentStatus: boolean;
  auditLog: "basic" | "full" | number;
  /** Maximum internal workspace members. -1 = unlimited. */
  membersLimit: number;
  /** Audit log retention in days. */
  auditRetentionDays: number;
  /** Email branding behavior. */
  emailBranding: EmailBranding;
  /** Storage limit in GB. */
  storageLimitGb: number;
};
