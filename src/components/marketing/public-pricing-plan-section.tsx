"use client";

import { useState, type ReactNode } from "react";
import {
  IN_APP_PLAN_CATALOG,
  formatPriceMonthly,
  formatPriceExact,
  type PlanCode,
  type InAppPlanItem,
} from "@/lib/billing/plan-catalog";
import { ButtonLink } from "@/components/ui/button";

type BillingCycle = "monthly" | "annual";

const CTA_LABELS: Record<PlanCode, string> = {
  free: "Start Free",
  starter: "Start Starter",
  pro: "Start Pro",
  scale: "Start Scale",
};

type ComparisonRow = {
  label: string;
  free: ReactNode;
  starter: ReactNode;
  pro: ReactNode;
  scale: ReactNode;
};

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Internal members",
    free: "5",
    starter: "15",
    pro: "80",
    scale: "Unlimited",
  },
  {
    label: "Requests / month",
    free: "35",
    starter: "Unlimited",
    pro: "Unlimited",
    scale: "Unlimited",
  },
  {
    label: "PDF exports / month",
    free: "3 (watermarked)",
    starter: "25",
    pro: "Unlimited",
    scale: "Unlimited",
  },
  {
    label: "ZIP audit bundle",
    free: "—",
    starter: "—",
    pro: <span aria-label="Yes">✓</span>,
    scale: <span aria-label="Yes">✓</span>,
  },
  {
    label: "Audit log retention",
    free: "30 days",
    starter: "90 days",
    pro: "1 year",
    scale: "3 years",
  },
  {
    label: "Email branding",
    free: "Powered by Relitrue",
    starter: "Powered by Relitrue",
    pro: "Removed",
    scale: "Removed",
  },
  {
    label: "Storage",
    free: "1 GB",
    starter: "20 GB",
    pro: "100 GB",
    scale: "500 GB",
  },
  {
    label: "Support",
    free: "Community / email",
    starter: "Email",
    pro: "Priority email",
    scale: "Priority email (faster target)",
  },
];

function BillingCycleToggle({
  value,
  onChange,
}: {
  value: BillingCycle;
  onChange: (v: BillingCycle) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-2 rounded-full border border-(--border-subtle) bg-(--bg-surface) p-1 shadow-sm"
      role="group"
      aria-label="Billing cycle"
    >
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          value === "monthly"
            ? "bg-(--color-primary) text-white shadow-sm"
            : "text-(--text-secondary) hover:text-(--text-primary)"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          value === "annual"
            ? "bg-(--color-primary) text-white shadow-sm"
            : "text-(--text-secondary) hover:text-(--text-primary)"
        }`}
      >
        <span>Annual</span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            value === "annual"
              ? "bg-white/20 text-white"
              : "border border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-muted)"
          }`}
        >
          Save ~15%
        </span>
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  billingCycle,
  isLoggedIn,
}: {
  plan: InAppPlanItem;
  billingCycle: BillingCycle;
  isLoggedIn: boolean;
}) {
  const isStarter = plan.mostPopular === true;
  const isScale = plan.code === "scale";

  const borderClass = isStarter
    ? "border-(--color-primary)"
    : "border-(--border-subtle)";

  const ctaHref = isLoggedIn
    ? "/app/settings/workspace?tab=billing"
    : "/auth/sign-in";
  const ctaLabel = isLoggedIn ? "Go to Billing" : CTA_LABELS[plan.code];

  const monthlyLine =
    plan.priceMonthlyCents === 0 ? (
      <span className="text-3xl font-semibold text-(--text-primary)">$0</span>
    ) : (
      <span className="text-3xl font-semibold text-(--text-primary)">
        {formatPriceMonthly(plan.priceMonthlyCents)}
      </span>
    );

  const annualBlock =
    plan.priceYearlyCents > 0 ? (
      <div className="mt-1 space-y-0.5">
        <p className="text-sm font-medium text-(--text-primary)">
          {formatPriceExact(plan.priceYearlyPerMonthCents)}/mo billed annually
        </p>
        <p className="text-xs text-(--text-muted)">
          {formatPriceExact(plan.priceYearlyCents)} per year
        </p>
      </div>
    ) : null;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-(--bg-surface-elev) p-8 shadow-sm transition-shadow hover:shadow-md ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-(--text-primary)">{plan.name}</h3>
          <p className="mt-2 text-sm text-(--text-secondary)">{plan.bestFor}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isStarter ? (
            <span className="rounded-md bg-(--color-primary) px-2 py-1 text-xs font-semibold text-white">
              Most popular
            </span>
          ) : null}
          {isScale ? (
            <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs font-medium text-(--text-muted)">
              Enterprise-grade
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {billingCycle === "monthly" ? (
          <div className="flex flex-wrap items-end gap-2">
            {monthlyLine}
            <span className="pb-1 text-sm text-(--text-muted)">/workspace/month</span>
          </div>
        ) : (
          <div>
            {plan.priceYearlyCents === 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                {monthlyLine}
                <span className="pb-1 text-sm text-(--text-muted)">/workspace/month</span>
              </div>
            ) : (
              annualBlock
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-(--text-muted)">
          {billingCycle === "annual" && plan.priceYearlyCents > 0
            ? "Billed annually upfront."
            : "Billed monthly. Cancel anytime."}
        </p>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
          Highlights
        </p>
        <ul className="mt-3 space-y-3 text-sm text-(--text-secondary)">
          {plan.includes.slice(0, 6).map((f) => (
            <li key={f} className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
          Limits
        </p>
        <ul className="mt-3 space-y-3 text-sm text-(--text-secondary)">
          {plan.limits.map((l) => (
            <li key={l} className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--border-subtle)" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <ButtonLink href={ctaHref} variant={isStarter ? "primary" : "secondary"}>
          {ctaLabel}
        </ButtonLink>
      </div>
    </div>
  );
}

export function PublicPricingPlanSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  return (
    <>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-(--text-secondary)">
          Choose monthly or annual billing. Annual plans save about 15% versus paying monthly.
        </p>
        <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {IN_APP_PLAN_CATALOG.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            billingCycle={billingCycle}
            isLoggedIn={isLoggedIn}
          />
        ))}
      </div>

      <p className="mt-6 text-sm text-(--text-muted)">
        Annual plans are billed upfront. ~15% savings versus monthly billing.
      </p>

      <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-(--text-muted)">
        <span>Workspace-based pricing</span>
        <span>Secure tokenized approvals</span>
        <span>Audit-ready timeline</span>
        <span>Cancel anytime</span>
      </div>

      <div className="mt-12 rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-(--text-primary)">Billing clarity</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-(--text-secondary)">
          <p>
            <strong>Requests are counted per workspace</strong> (including external approvals). The
            Free plan includes 35 requests per month; Starter, Pro, and Scale include unlimited
            requests with fair use.
          </p>
          <p>
            <strong>PDF exports:</strong> Free includes 3 watermarked exports per month. Starter
            includes 25; Pro and Scale include unlimited exports without watermark.
          </p>
          <p>
            <strong>Annual billing:</strong> charged upfront for the year. You can manage your
            subscription from workspace billing settings.
          </p>
        </div>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-(--text-muted)">
        API/Webhooks and SSO/SAML are planned roadmap items and are not included in current plans.
      </p>

      <div className="mt-14">
        <h2 className="text-xl font-semibold text-(--text-primary) md:text-2xl">
          Compare plans
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
          Full feature comparison across Free, Starter, Pro, and Scale.
        </p>

        <div className="mt-6 overflow-x-auto rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-(--border-subtle)">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[10rem] bg-(--bg-surface) px-4 py-3 text-xs font-semibold uppercase tracking-wide text-(--text-muted)"
                >
                  Feature
                </th>
                {IN_APP_PLAN_CATALOG.map((p) => (
                  <th
                    key={p.code}
                    scope="col"
                    className="px-4 py-3 text-center text-xs font-semibold text-(--text-primary)"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-(--border-subtle) last:border-b-0"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-(--bg-surface) px-4 py-3 font-medium text-(--text-primary)"
                  >
                    {row.label}
                  </th>
                  <td className="px-4 py-3 text-center text-(--text-secondary)">{row.free}</td>
                  <td className="px-4 py-3 text-center text-(--text-secondary)">{row.starter}</td>
                  <td className="px-4 py-3 text-center text-(--text-secondary)">{row.pro}</td>
                  <td className="px-4 py-3 text-center text-(--text-secondary)">{row.scale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
