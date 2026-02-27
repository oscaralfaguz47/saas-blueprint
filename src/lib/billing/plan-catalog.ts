/**
 * Static in-app plan catalog for billing UX (plan selector, confirm step).
 * Not used for marketing pricing page. Prices align with seed/database (cents).
 * Annual billing: prepared for; not implemented (see EPIC 3 scope).
 */

export type PlanCode = "free" | "starter" | "pro" | "enterprise";

export type InAppPlanItem = {
  code: PlanCode;
  name: string;
  /** Monthly price in cents; 0 for free. */
  priceMonthlyCents: number;
  /** One-liner "Best for …" */
  bestFor: string;
  /** Key includes (max 5 for UI). */
  includes: string[];
  /** Limits (max 3 for UI). */
  limits: string[];
  /** Optional 1-line legal/clarity note. */
  legalNote?: string;
  /** "Most popular" badge (e.g. Starter). */
  mostPopular?: boolean;
};

export const IN_APP_PLAN_CATALOG: InAppPlanItem[] = [
  {
    code: "free",
    name: "Free",
    priceMonthlyCents: 0,
    bestFor: "Trying out approvals with minimal usage.",
    includes: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals (secure links)",
      "Basic audit visibility",
    ],
    limits: [
      "Requests: 10 / month",
      "PDF exports: 1 / month (watermarked)",
      "No ZIP audit bundle",
    ],
  },
  {
    code: "starter",
    name: "Starter",
    priceMonthlyCents: 5900,
    bestFor: "Teams running approvals as a weekly habit.",
    includes: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals & manual reminders",
      "Payment status + proof",
      "Full-text search & audit (90 days)",
    ],
    limits: [
      "Requests: 200 / month (rollover)",
      "PDF exports: 50 / month",
      "Overage: +$0.25 per extra request",
    ],
    mostPopular: true,
  },
  {
    code: "pro",
    name: "Pro",
    priceMonthlyCents: 19900,
    bestFor: "Sensitive workflows that need full auditability.",
    includes: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals & manual reminders",
      "Unlimited PDF exports, audit bundle ZIP",
      "Full audit visibility",
    ],
    limits: [
      "Requests: 2,000 / month (soft cap), rollover",
      "Evidence storage: higher limit",
      "Rollover: unused requests roll over",
    ],
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceMonthlyCents: 49900,
    bestFor: "Teams with predictable high volume and hard limits.",
    includes: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals & manual reminders",
      "Unlimited PDF exports, audit bundle ZIP",
      "Full audit visibility",
    ],
    limits: [
      "Requests: 4,000 / month (hard cap)",
      "No overage billing",
      "Self-serve",
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

/** Order for comparison: free < starter < pro < enterprise. */
export const PLAN_ORDER: PlanCode[] = ["free", "starter", "pro", "enterprise"];

export function isUpgrade(from: PlanCode, to: PlanCode): boolean {
  const i = PLAN_ORDER.indexOf(from);
  const j = PLAN_ORDER.indexOf(to);
  return j > i;
}

export function isDowngrade(from: PlanCode, to: PlanCode): boolean {
  const i = PLAN_ORDER.indexOf(from);
  const j = PLAN_ORDER.indexOf(to);
  return j < i;
}
