import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

type PlanKey = "free" | "starter" | "pro";

type Plan = {
  key: PlanKey;
  name: string;
  price: string;
  priceNote?: string;
  tagline: string;
  highlighted?: boolean;
  features: string[];
  limits: string[];
  ctaLabel: string;
  ctaHref: string;
};

const plans: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    priceNote: "Try it, but feel the pain.",
    tagline: "Use it seriously, then hit real limits fast.",
    features: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals enabled (secure links)",
      "Basic AuditLog visibility",
    ],
    limits: [
      "Requests: 10 / month (per workspace)",
      "PDF exports: 1 / month (watermarked)",
      "Evidence storage: basic limit",
      "No ZIP audit bundle",
    ],
    ctaLabel: "Start Free",
    ctaHref: "/auth/sign-in",
  },
  {
    key: "starter",
    name: "Starter",
    price: "$59",
    priceNote: "Small team using it seriously.",
    tagline: "For teams running approvals as a weekly operational habit.",
    highlighted: true,
    features: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals enabled (secure links)",
      "Payment status + proof enabled",
      "Manual reminders enabled",
      "Full-text search enabled",
      "AuditLog view (last 90 days)",
      "Watermark removed (or optional)",
    ],
    limits: [
      "Requests: 200 / month (per workspace)",
      "PDF exports: 50 / month",
      "Evidence storage: plan limit",
      "Overage: +$0.25 per extra request (Option 1)",
      "Rollover: unused requests roll over (paid only)",
    ],
    ctaLabel: "Start Starter",
    ctaHref: "/auth/sign-in",
  },
  {
    key: "pro",
    name: "Pro",
    price: "$199",
    priceNote: "Audit-ready / compliance / full control.",
    tagline: "For sensitive workflows that need full auditability.",
    features: [
      "1 workspace",
      "Unlimited users & approvers",
      "External approvals enabled (secure links)",
      "Unlimited PDF exports",
      "Audit bundle ZIP enabled",
      "Full AuditLog visibility",
      "Roadmap priority + advanced configurations (future)",
    ],
    limits: [
      "Requests: Unlimited (soft cap: 2,000 / month)",
      "Evidence storage: higher plan limit",
      "Rollover: unused requests roll over (paid only)",
    ],
    ctaLabel: "Start Pro",
    ctaHref: "/auth/sign-in",
  },
];

function PlanCard({ plan, isLoggedIn }: { plan: Plan; isLoggedIn: boolean }) {
  const borderClass = plan.highlighted
    ? "border-(--color-primary)"
    : "border-(--border-subtle)";

  const bgClass = plan.highlighted
    ? "bg-(--bg-surface-elev)"
    : "bg-(--bg-surface)";

  const ctaHref = isLoggedIn ? "/app/settings/workspace?tab=billing" : plan.ctaHref;
  const ctaLabel = isLoggedIn ? "Go to Billing" : plan.ctaLabel;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-(--bg-surface-elev) p-8 shadow-sm ${borderClass} transition-shadow hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-(--text-primary)">
            {plan.name}
          </h3>
          {plan.priceNote ? (
            <p className="mt-1 text-xs font-medium text-(--text-muted)">
              {plan.priceNote}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-(--text-secondary)">{plan.tagline}</p>
        </div>

        {plan.highlighted ? (
          <span className="rounded-md bg-(--color-primary) px-2 py-1 text-xs font-semibold text-white">
            Most popular
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold text-(--text-primary)">
            {plan.price}
          </span>
          <span className="pb-1 text-sm text-(--text-muted)">
            /workspace/month
          </span>
        </div>
        <p className="mt-2 text-xs text-(--text-muted)">
          Billed monthly. Cancel anytime.
        </p>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
          Includes
        </p>
        <ul className="mt-3 space-y-3 text-sm text-(--text-secondary)">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
          Limits & billing rules
        </p>
        <ul className="mt-3 space-y-3 text-sm text-(--text-secondary)">
          {plan.limits.map((l) => (
            <li key={l} className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-(--border-subtle)" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <ButtonLink
          href={ctaHref}
          variant={plan.highlighted ? "primary" : "secondary"}
        >
          {ctaLabel}
        </ButtonLink>
      </div>

      {plan.key === "starter" ? (
        <p className="mt-3 text-xs text-(--text-muted)">
          Overage applies only after 200 requests/month per workspace.
        </p>
      ) : null}

      {plan.key === "pro" ? (
        <p className="mt-3 text-xs text-(--text-muted)">
          Soft cap protects system fairness; typical teams never hit it.
        </p>
      ) : null}
    </div>
  );
}

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
        <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
          {eyebrow}
        </p>
      ) : null}

      <h1 className="mt-2 text-3xl font-semibold text-(--text-primary) md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-(--text-secondary)">
        {description}
      </p>
    </div>
  );
}

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <main className="min-h-screen bg-(--marketing-section-alt)">
      {/* Header */}
      <header className="border-b border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface)"
              >
                <span className="text-xs font-semibold text-(--text-primary)">
                  ATL
                </span>
              </Link>

              <Link href="/" className="text-sm font-medium text-(--text-primary)">
                ATL
              </Link>

              <span className="hidden text-sm text-(--text-muted) md:inline">
                Pricing
              </span>
            </div>

            <nav className="flex items-center gap-3">
              <Link
                href="/help"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Get in touch
              </Link>
              <Link
                href="/"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Home
              </Link>

              <Link
                href="/terms"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Terms
              </Link>

              <Link
                href="/privacy"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Privacy
              </Link>

              <ButtonLink
                href={isLoggedIn ? "/app/settings/workspace?tab=billing" : "/auth/sign-in"}
                variant="secondary"
              >
                {isLoggedIn ? "Billing" : "Sign in"}
              </ButtonLink>
            </nav>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <section className="bg-(--marketing-hero-bg)">
        <Container>
          <div className="py-20 md:py-24">
            <SectionTitle
              eyebrow="Simple, self-serve"
              title="Pricing per workspace, designed for critical approvals"
              description="Your usage may be seasonal — that’s normal. Paid plans include rollover, so you don’t lose unused capacity. All plans include secure external approval links, revocation, and an audit-ready timeline."
            />

            {/* Plans */}
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <PlanCard key={p.key} plan={p} isLoggedIn={isLoggedIn} />
              ))}
            </div>

            {/* Mini trust row */}
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-(--text-muted)">
              <span>Workspace-based pricing</span>
              <span>Secure tokenized approvals</span>
              <span>Audit-ready timeline</span>
              <span>Cancel anytime</span>
            </div>

            {/* Billing clarity (important for Paddle review + conversion) */}
            <div className="mt-12 rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-(--text-primary)">
                Billing clarity
              </h2>
              <div className="mt-2 space-y-2 text-sm text-(--text-secondary) leading-relaxed">
                <p>
                  <strong>Requests are counted per workspace</strong> (including external approvals).
                </p>
                <p>
                  <strong>Starter overage (Option 1):</strong> after 200 requests/month, extra requests are billed at{" "}
                  <strong>$0.25 per request</strong>.
                </p>
                <p>
                  <strong>Rollover:</strong> unused requests roll over on paid plans (Starter/Pro).
                </p>
                <p>
                  <strong>Monthly plans only</strong> for now. You can cancel any time; changes take effect at the end of the billing period.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="bg-(--marketing-section-alt)">
        <Container>
          <div className="py-20">
            <h2 className="text-2xl font-semibold text-(--text-primary) md:text-3xl">
              FAQ
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
              The most common questions before teams roll this into their process.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  What counts as a “request”?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  A request is a workflow item created in your workspace (including external approvals). Limits are per workspace per month.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  What happens if an external approver never responds?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  The request stays in <span className="text-(--text-primary)">Pending — No response</span>.
                  We never auto-approve. The timeline shows reminders and key milestones.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Can I revoke an approval link?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  Yes. Links are scoped per request, expiring by default, and revocable at any time.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Do external approvers need an account?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  No. They receive a secure link where they can approve/reject and optionally comment.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  How does rollover work?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  On paid plans, unused request capacity can roll over so seasonal usage doesn’t feel punitive.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Is this a payments platform?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  No. ATL is workflow software. It helps document approvals and evidence, and optionally tracks payment status as a record field.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink
                href={isLoggedIn ? "/app/settings/workspace?tab=billing" : "/auth/sign-in"}
                variant="primary"
              >
                {isLoggedIn ? "Open Billing" : "Start free"}
              </ButtonLink>
              <ButtonLink href="/" variant="secondary">
                See how it works
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer className="border-t border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-(--text-muted)">
              © {new Date().getFullYear()} ATL. All rights reserved.
            </div>

            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/privacy"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Terms
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Sign in
              </Link>
            </div>
          </div>
        </Container>
      </footer>
    </main>
  );
}
