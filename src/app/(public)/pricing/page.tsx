import Link from "next/link";
import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">
          {eyebrow}
        </p>
      ) : null}

      <h1 className="mt-3 text-3xl font-bold text-(--text-primary) md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-base text-(--text-secondary)">{description}</p>
    </div>
  );
}

function PricingPlanSectionSkeleton() {
  return (
    <div className="mt-10 space-y-8" aria-busy="true" aria-label="Loading pricing">
      <div className="h-10 w-full max-w-md animate-pulse rounded-full bg-(--border-subtle)" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[28rem] animate-pulse rounded-2xl border border-(--border-subtle) bg-(--bg-surface-elev)"
          />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-(--border-subtle) bg-(--bg-surface)" />
      <div className="h-64 animate-pulse rounded-xl border border-(--border-subtle) bg-(--bg-surface)" />
    </div>
  );
}

const PublicPricingPlanSection = dynamic(
  () =>
    import("@/components/marketing/public-pricing-plan-section").then(
      (mod) => mod.PublicPricingPlanSection
    ),
  {
    loading: () => <PricingPlanSectionSkeleton />,
    ssr: true,
  }
);

function TrustDot() {
  return <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />;
}

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Do external approvers need an account?",
    a: "No. Approvers receive a secure, tokenized link by email. They can review and approve directly — no sign-up, no password, no friction.",
  },
  {
    q: "What counts as a workspace?",
    a: "A workspace is a single organization or team environment. Each workspace has its own members, requests, billing, and audit trail.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Yes. Upgrades apply immediately. Downgrades take effect at the end of your current billing period. No data is ever deleted when you change plans.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "All plans start with access to the Free tier so you can evaluate the product. Paid plans unlock higher limits and advanced features when you're ready.",
  },
  {
    q: "What happens to my data if I downgrade?",
    a: "Your existing records, evidence, and timelines are always preserved. Downgrading restricts future actions within the lower plan limits but never deletes historical data.",
  },
  {
    q: "Do you support annual billing?",
    a: "Yes. Annual billing is available on all paid plans and includes a discount. You can switch between monthly and annual from workspace billing settings.",
  },
  {
    q: "Is my data encrypted?",
    a: "Yes. All data is encrypted in transit (TLS) and at rest. File attachments are stored privately with short-lived signed access URLs.",
  },
  {
    q: "Can I get an invoice for my subscription?",
    a: "Yes. Invoices are generated automatically for every billing cycle and accessible from your workspace billing settings.",
  },
];

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  const primaryCtaHref = isLoggedIn
    ? "/app/settings/workspace?tab=billing"
    : "/auth/sign-in";
  const primaryCtaLabel = isLoggedIn ? "Go to billing" : "Get started free";

  return (
    <main className="min-h-screen bg-(--marketing-hero-bg)">
      <PublicHeader isLoggedIn={isLoggedIn} />

      {/* SECTION 1 — PRICING HERO */}
      <section className="bg-(--marketing-hero-bg)">
        <MarketingContainer className="!py-24 md:!py-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Simple, transparent pricing
            </p>
            <h1 className="mt-0 text-4xl font-bold leading-[1.1] tracking-tight text-(--text-primary) md:text-5xl">
              The right plan for your approval workflow.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-(--text-secondary) md:text-lg">
              All plans include secure external approval links, revocation, evidence attachments, and
              an audit-ready timeline. Upgrade or change anytime.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2">
              <span className="flex items-center text-xs text-(--text-muted)">
                <TrustDot />
                No contracts. Cancel anytime.
              </span>
              <span className="flex items-center text-xs text-(--text-muted)">
                <TrustDot />
                Upgrade or downgrade instantly.
              </span>
              <span className="flex items-center text-xs text-(--text-muted)">
                <TrustDot />
                All plans include external approvals.
              </span>
            </div>
          </div>
        </MarketingContainer>
      </section>

      {/* SECTION 2 — PLANS */}
      <section className="bg-(--marketing-hero-bg) pb-24">
        <MarketingContainer className="!py-0">
          <SectionTitle
            eyebrow="Pricing plans"
            title="Pricing per workspace, designed for critical approvals"
            description="Choose the plan that matches your team size, audit needs, and storage. All plans include secure external approval links, revocation, and an audit-ready timeline. Upgrade or change plans anytime from workspace billing."
          />

          <PublicPricingPlanSection isLoggedIn={isLoggedIn} />
        </MarketingContainer>
      </section>

      {/* SECTION 3 — FAQ */}
      <section className="bg-(--marketing-section-alt) py-24">
        <MarketingContainer className="!py-0">
          <div className="mb-14">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">FAQ</p>
            <h2 className="mt-3 text-3xl font-bold text-(--text-primary) md:text-4xl">
              Common questions before you commit.
            </h2>
            <p className="mt-3 max-w-2xl text-base text-(--text-secondary)">
              Everything you need to know about plans, billing, and how Relitrue works.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {FAQ_ITEMS.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-6"
              >
                <h3 className="mb-2 text-sm font-semibold text-(--text-primary)">{item.q}</h3>
                <p className="text-sm leading-relaxed text-(--text-secondary)">{item.a}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </section>

      {/* SECTION 4 — FINAL CTA */}
      <section className="border-y border-(--border-subtle) bg-(--bg-surface) py-20">
        <MarketingContainer className="!py-0">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-(--text-primary) md:text-4xl">
              Start closing approvals with confidence.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-(--text-secondary)">
              Join finance and operations teams already using Relitrue to bring structure and
              auditability to every approval.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                href={primaryCtaHref}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                {primaryCtaLabel}
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-md border border-(--border-subtle) px-6 py-3 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                See how it works
              </Link>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <PublicFooter isLoggedIn={isLoggedIn} />
    </main>
  );
}
