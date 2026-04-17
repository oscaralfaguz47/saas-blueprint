/**
 * Static in-app plan catalog for billing UX (plan selector, confirm step, Change Plan modal).
 * Prices in cents. Source of truth for UI display only — enforcement is server-side.
 */

export type PlanCode = "free" | "starter" | "pro" | "scale";

export type InAppPlanItem = {
  code: PlanCode;
  name: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  /** Annual price per month equivalent for display. */
  priceYearlyPerMonthCents: number;
  bestFor: string;
  includes: string[];
  limits: string[];
  legalNote?: string;
  mostPopular?: boolean;
};

export const IN_APP_PLAN_CATALOG: InAppPlanItem[] = [
  {
    code: "free",
    name: "Free",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    priceYearlyPerMonthCents: 0,
    bestFor: "Trying out approvals with a small team.",
    includes: [
      "5 internal members",
      "Unlimited external approvers",
      "External approvals (secure links)",
      "Basic audit visibility (30-day retention)",
      "1 GB storage",
    ],
    limits: [
      "Requests: 35 / month",
      "PDF exports: 3 / month (watermarked)",
      "No ZIP audit bundle",
    ],
  },
  {
    code: "starter",
    name: "Starter",
    priceMonthlyCents: 4900,
    priceYearlyCents: 49900,
    priceYearlyPerMonthCents: 4158,
    bestFor: "Teams running approvals as a regular habit.",
    includes: [
      "15 internal members",
      "Unlimited external approvers",
      "External approvals & manual reminders",
      "Payment status + proof",
      "Audit log (90-day retention)",
      "20 GB storage",
    ],
    limits: [
      "Requests: Unlimited",
      "PDF exports: 25 / month",
      "No ZIP audit bundle",
    ],
    mostPopular: true,
  },
  {
    code: "pro",
    name: "Pro",
    priceMonthlyCents: 9900,
    priceYearlyCents: 100900,
    priceYearlyPerMonthCents: 8408,
    bestFor: "Sensitive workflows that need full auditability.",
    includes: [
      "80 internal members",
      "Unlimited external approvers",
      "External approvals & manual reminders",
      "Unlimited PDF exports (no watermark)",
      "ZIP audit bundle",
      "Full audit log (1-year retention)",
      "100 GB storage",
    ],
    limits: [
      "Requests: Unlimited",
      "Email branding removed",
    ],
  },
  {
    code: "scale",
    name: "Scale",
    priceMonthlyCents: 24900,
    priceYearlyCents: 253900,
    priceYearlyPerMonthCents: 21158,
    bestFor: "Large teams with high volume and strict compliance needs.",
    includes: [
      "Unlimited internal members",
      "Unlimited external approvers",
      "External approvals & manual reminders",
      "Unlimited PDF exports (no watermark)",
      "ZIP audit bundle",
      "Full audit log (3-year retention)",
      "500 GB storage",
    ],
    limits: [
      "Requests: Unlimited",
      "Email branding removed",
    ],
  },
];

export function getPlanFromCatalog(code: PlanCode): InAppPlanItem | undefined {
  return IN_APP_PLAN_CATALOG.find((p) => p.code === code);
}

export function formatPriceMonthly(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(0)}`;
}

export function formatPriceExact(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

/** Order for comparison: free < starter < pro < scale. */
export const PLAN_ORDER: PlanCode[] = ["free", "starter", "pro", "scale"];

export function isUpgrade(from: PlanCode, to: PlanCode): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}

export function isDowngrade(from: PlanCode, to: PlanCode): boolean {
  return PLAN_ORDER.indexOf(to) < PLAN_ORDER.indexOf(from);
}
