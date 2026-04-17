import Link from "next/link";
import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

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
                <span className="text-xs font-semibold text-(--text-primary)">ATL</span>
              </Link>

              <Link href="/" className="text-sm font-medium text-(--text-primary)">
                ATL
              </Link>

              <span className="hidden text-sm text-(--text-muted) md:inline">Pricing</span>
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

      {/* Hero + plans (client island inside Suspense) */}
      <section className="bg-(--marketing-hero-bg)">
        <Container>
          <div className="py-20 md:py-24">
            <SectionTitle
              eyebrow="Simple, self-serve"
              title="Pricing per workspace, designed for critical approvals"
              description="Choose the plan that matches your team size, audit needs, and storage. All plans include secure external approval links, revocation, and an audit-ready timeline. Upgrade or change plans anytime from workspace billing."
            />

            <PublicPricingPlanSection isLoggedIn={isLoggedIn} />
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="bg-(--marketing-section-alt)">
        <Container>
          <div className="py-20">
            <h2 className="text-2xl font-semibold text-(--text-primary) md:text-3xl">FAQ</h2>
            <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
              The most common questions before teams roll this into their process.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  What counts as a “request”?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  A request is a workflow item created in your workspace (including external
                  approvals). The Free plan includes 35 requests per month; Starter, Pro, and Scale
                  include unlimited requests with fair use. Limits are per workspace per billing
                  period.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  What happens if an external approver never responds?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  The request stays in{" "}
                  <span className="text-(--text-primary)">Pending — No response</span>. We never
                  auto-approve. The timeline shows reminders and key milestones.
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
                  No. They receive a secure link where they can approve/reject and optionally
                  comment.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  How does rollover work?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  Rollover and fair-use rules depend on your plan and billing period. Starter, Pro,
                  and Scale include unlimited requests with fair use rather than a fixed monthly
                  request bank with rollover. Your workspace billing page shows what applies to
                  your subscription.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Is this a payments platform?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  No. ATL is workflow software. It helps document approvals and evidence, and
                  optionally tracks payment status as a record field.
                </p>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink
                href={isLoggedIn ? "/app/settings/workspace?tab=billing" : "/auth/sign-in"}
                variant="primary"
              >
                {isLoggedIn ? "Go to Billing" : "Start free"}
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
