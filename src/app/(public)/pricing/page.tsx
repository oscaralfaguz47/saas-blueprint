import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";

import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

type PlanKey = "free" | "starter" | "pro";

type Plan = {
  key: PlanKey;
  name: string;
  price: string;
  tagline: string;
  highlighted?: boolean;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
};

const plans: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    tagline: "For trying the full loop with real approvals.",
    features: [
      "Up to 3 records",
      "Up to 3 external approvals",
      "Evidence storage up to 10MB total",
      "Timeline + basic search",
      "Tokenized external links (expiring)",
    ],
    ctaLabel: "Get started",
    ctaHref: "/auth/sign-in",
  },
  {
    key: "starter",
    name: "Starter",
    price: "$29",
    tagline: "Best for small teams running approvals weekly.",
    highlighted: true,
    features: [
      "Unlimited records",
      "Unlimited external approvals",
      "Unlimited evidence storage",
      "Timeline + search filters",
      "Reminders (48h / 96h)",
      "Revoke + resend approvals",
    ],
    ctaLabel: "Start Starter",
    ctaHref: "/auth/sign-in",
  },
  {
    key: "pro",
    name: "Pro",
    price: "$79",
    tagline: "For sensitive workflows and stronger governance.",
    features: [
      "Everything in Starter",
      "Sensitive gating (extra verification)",
      "Extended history retention",
      "Advanced controls for approvals",
      "Priority support (v1)",
    ],
    ctaLabel: "Start Pro",
    ctaHref: "/auth/sign-in",
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  const borderClass = plan.highlighted
    ? "border-(--color-primary)"
    : "border-(--border-subtle)";

  const bgClass = plan.highlighted
    ? "bg-(--bg-surface-elev)"
    : "bg-(--bg-surface)";

  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-(--text-primary)">
            {plan.name}
          </h3>
          <p className="mt-1 text-sm text-(--text-secondary)">{plan.tagline}</p>
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

      <ul className="mt-6 space-y-3 text-sm text-(--text-secondary)">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <ButtonLink
          href={plan.ctaHref}
          variant={plan.highlighted ? "primary" : "secondary"}
        >
          {plan.ctaLabel}
        </ButtonLink>
      </div>
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

  // If logged-in, pricing is still useful, but you can route to billing if you prefer.
  // Keeping it public is usually better for conversion.
  if (session?.user) {
    // Optional: redirect("/app/billing");
    // For now: keep pricing visible even when logged-in.
  }

  return (
    <main className="min-h-screen bg-(--bg-main)">
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

              <Link
                href="/"
                className="text-sm font-medium text-(--text-primary)"
              >
                ATL
              </Link>

              <span className="hidden text-sm text-(--text-muted) md:inline">
                Pricing
              </span>
            </div>

            <nav className="flex items-center gap-3">
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

              <ButtonLink href="/auth/sign-in" variant="secondary">
                Sign in
              </ButtonLink>
            </nav>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <section className="bg-(--bg-main)">
        <Container>
          <div className="py-16 md:py-20">
            <SectionTitle
              eyebrow="Simple and self-serve"
              title="Plans that scale with your approvals"
              description="Start free to validate the loop. Upgrade when approvals become operational. All plans include tokenized external links, revocation, and an audit-ready timeline."
            />

            {/* Plans */}
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <PlanCard key={p.key} plan={p} />
              ))}
            </div>

            {/* Mini trust row */}
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-(--text-muted)">
              <span>No passwords required (Magic Link)</span>
              <span>Secure tokenized approvals</span>
              <span>Cancel anytime</span>
            </div>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="bg-(--bg-app)">
        <Container>
          <div className="py-16">
            <h2 className="text-2xl font-semibold text-(--text-primary) md:text-3xl">
              FAQ
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
              The most common questions before teams roll this into their process.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  What happens if the client never responds?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  The record stays in <span className="text-(--text-primary)">Pending — No response</span>.
                  We never auto-approve. The timeline shows reminders and SLA milestones.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Can I revoke an approval link?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  Yes. Links are scoped per record, expiring by default, and revocable at any time.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  Do external approvers need an account?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  No. They get a secure link where they can approve/reject and optionally comment.
                </p>
              </div>

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                <h3 className="text-sm font-semibold text-(--text-primary)">
                  What about sensitive records?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  Pro includes sensitive gating, adding an extra verification step before attachments are shown.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/auth/sign-in" variant="primary">
                Start free
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
