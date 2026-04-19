import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

import { Container } from "@/components/ui/container";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

/* -------------------------------------------------------------------------- */
/*                         Inline icons (no lucide dep)                        */
/* -------------------------------------------------------------------------- */

const i20 = "h-5 w-5 shrink-0";

function IcoFileText() {
  return (
    <svg className={i20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IcoPaperclip() {
  return (
    <svg className={i20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcoSend() {
  return (
    <svg className={i20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m22 2-7 20-4-9-9-4Zm0 0L2 22l7-20 9 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcoLink() {
  return (
    <svg className={i20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcoShield() {
  return (
    <svg className={i20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcoLock() {
  return (
    <svg className={i20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IcoPaperclipSm({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-3.5 w-3.5"} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcoCheckSm({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-3.5 w-3.5"} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcoLockSm({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-3.5 w-3.5"} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrustDot() {
  return <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />;
}

/* -------------------------------------------------------------------------- */
/*                               Public Landing                               */
/* -------------------------------------------------------------------------- */

export default async function PublicHomePage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  const primaryCtaHref = isLoggedIn ? "/app/requests" : "/auth/sign-in";
  const primaryCtaLabel = isLoggedIn ? "Go to app" : "Get started free";

  return (
    <main className="min-h-screen bg-(--marketing-hero-bg)">
      <PublicHeader isLoggedIn={isLoggedIn} />

      {/* SECTION 1 — HERO */}
      <section className="bg-(--marketing-hero-bg)">
        <Container className="!py-24 md:!py-32">
          <div className="grid gap-12 md:grid-cols-12 md:items-center">
            <div className="md:col-span-6 lg:col-span-7">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Financial approval workflows
              </p>
              <h1 className="mt-0 text-4xl font-bold leading-[1.1] tracking-tight text-(--text-primary) md:text-5xl lg:text-[56px]">
                The approval layer your finance team can trust.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-(--text-secondary) md:text-lg">
                Relitrue gives finance and operations teams a structured way to request, track, and
                close external approvals — with evidence, immutable timelines, and zero ambiguity.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href={primaryCtaHref}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                >
                  {primaryCtaLabel}
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-md border border-(--border-subtle) px-6 py-3 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:text-(--text-primary)"
                >
                  View pricing
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                <span className="flex items-center text-xs text-(--text-muted)">
                  <TrustDot />
                  Setup in under 5 minutes
                </span>
                <span className="flex items-center text-xs text-(--text-muted)">
                  <TrustDot />
                  No account required for approvers
                </span>
                <span className="flex items-center text-xs text-(--text-muted)">
                  <TrustDot />
                  Append-only audit timeline
                </span>
              </div>
            </div>

            <div className="md:col-span-6 lg:col-span-5">
              <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-(--text-primary)">Approval request</p>
                  <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                    Pending review
                  </span>
                </div>

                <div className="mt-5 rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
                      Record
                    </span>
                    <span className="text-xs text-(--text-muted)">REQ-2024-089</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-(--text-primary)">
                    Q4 Budget reallocation — Infrastructure
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-(--text-muted)">
                      <IcoPaperclipSm className="h-3.5 w-3.5 text-(--text-muted)" />
                      3 files attached
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <IcoCheckSm className="h-3.5 w-3.5 text-emerald-400" />
                      External approver notified
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-3">
                    <p className="mb-1 text-xs text-(--text-muted)">SLA</p>
                    <p className="text-sm font-semibold text-(--text-primary)">5 days</p>
                  </div>
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-3">
                    <p className="mb-1 text-xs text-(--text-muted)">Submitted</p>
                    <p className="text-sm font-semibold text-(--text-primary)">2h ago</p>
                  </div>
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-3">
                    <p className="mb-1 text-xs text-(--text-muted)">Evidence</p>
                    <p className="text-sm font-semibold text-(--text-primary)">3 files</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
                    Recent activity
                  </p>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-3 text-xs text-(--text-secondary)">
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="text-(--text-secondary)">Request submitted by J. Martinez</span>
                        <span className="ml-2 text-(--text-muted)">2h ago</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-3 text-xs text-(--text-secondary)">
                      <span
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-slate-600"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-(--text-secondary)">Evidence package uploaded</span>
                        <span className="ml-2 text-(--text-muted)">2h ago</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-3 text-xs text-(--text-secondary)">
                      <span
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-slate-600"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-(--text-secondary)">External approver link sent</span>
                        <span className="ml-2 text-(--text-muted)">1h ago</span>
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-(--border-subtle) pt-4 text-xs text-(--text-muted)">
                  <IcoLockSm className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
                  <span>Tokenized link · Expires in 5 days · Non-indexable</span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* SECTION 2 — METRICS */}
      <section className="border-y border-(--border-subtle) bg-(--bg-surface) py-12">
        <Container className="!py-0">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <p className="text-3xl font-bold text-emerald-400">&lt; 5 min</p>
              <p className="mt-1 text-sm text-(--text-muted)">Average setup time</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-(--text-primary)">100%</p>
              <p className="mt-1 text-sm text-(--text-muted)">Audit-ready by default</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-(--text-primary)">Zero</p>
              <p className="mt-1 text-sm text-(--text-muted)">Passwords needed for approvers</p>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-3xl font-bold text-(--text-primary)">SOC 2</p>
                <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                  Coming soon
                </span>
              </div>
              <p className="mt-1 text-sm text-(--text-muted)">Security standard alignment</p>
            </div>
          </div>
        </Container>
      </section>

      {/* SECTION 3 — HOW IT WORKS */}
      <section className="bg-(--marketing-section-alt) py-24">
        <Container className="!py-0">
          <div className="mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold text-(--text-primary) md:text-4xl">
              From request to closed approval in minutes.
            </h2>
            <p className="mt-3 max-w-2xl text-base text-(--text-secondary)">
              A structured loop designed for finance teams who can&apos;t afford ambiguity.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="relative rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8">
              <span
                className="pointer-events-none absolute right-6 top-6 select-none text-5xl font-black text-slate-700/50"
                aria-hidden
              >
                01
              </span>
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <IcoFileText />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Step 01
              </p>
              <h3 className="mb-3 text-xl font-semibold text-(--text-primary)">Create a structured record</h3>
              <p className="text-sm leading-relaxed text-(--text-secondary)">
                Define the decision context with structured fields. Capture what needs approval, why,
                and by when. Save as draft or submit immediately.
              </p>
            </div>

            <div className="relative rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8">
              <span
                className="pointer-events-none absolute right-6 top-6 select-none text-5xl font-black text-slate-700/50"
                aria-hidden
              >
                02
              </span>
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <IcoPaperclip />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Step 02
              </p>
              <h3 className="mb-3 text-xl font-semibold text-(--text-primary)">Attach evidence</h3>
              <p className="text-sm leading-relaxed text-(--text-secondary)">
                Upload supporting documents, contracts, or files. All evidence is version-tracked and
                permanently tied to the approval record.
              </p>
            </div>

            <div className="relative rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8">
              <span
                className="pointer-events-none absolute right-6 top-6 select-none text-5xl font-black text-slate-700/50"
                aria-hidden
              >
                03
              </span>
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <IcoSend />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Step 03
              </p>
              <h3 className="mb-3 text-xl font-semibold text-(--text-primary)">Send &amp; track externally</h3>
              <p className="text-sm leading-relaxed text-(--text-secondary)">
                Generate a secure, tokenized link for the external approver. No account needed. Track
                every action in the append-only timeline.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* SECTION 4 — TRUST */}
      <section className="bg-(--marketing-hero-bg) py-24">
        <Container className="!py-0">
          <div className="mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Trust &amp; governance
            </p>
            <h2 className="mt-3 text-3xl font-bold text-(--text-primary) md:text-4xl">
              Built for auditability from day one.
            </h2>
            <p className="mt-3 max-w-2xl text-base text-(--text-secondary)">
              Every action is recorded. Every approval is traceable. No exceptions.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="relative rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <IcoLink />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Security
              </p>
              <h3 className="mb-3 text-xl font-semibold text-(--text-primary)">Tokenized external links</h3>
              <p className="text-sm leading-relaxed text-(--text-secondary)">
                Every approval link is scoped, expiring, revocable, and non-indexable. External
                approvers get exactly the access they need — nothing more.
              </p>
            </div>

            <div className="relative rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <IcoShield />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Compliance
              </p>
              <h3 className="mb-3 text-xl font-semibold text-(--text-primary)">Append-only audit timeline</h3>
              <p className="text-sm leading-relaxed text-(--text-secondary)">
                An immutable, chronological record of every action taken on a request. Built for
                internal audits, compliance reviews, and dispute resolution.
              </p>
            </div>

            <div className="relative rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <IcoLock />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Control
              </p>
              <h3 className="mb-3 text-xl font-semibold text-(--text-primary)">Sensitive content gating</h3>
              <p className="text-sm leading-relaxed text-(--text-secondary)">
                Optionally require additional verification before attachments are visible to external
                parties. You control what gets exposed and when.
              </p>
            </div>
          </div>

          <div className="mt-14 flex flex-wrap gap-4">
            <Link
              href={primaryCtaHref}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              {primaryCtaLabel}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md border border-(--border-subtle) px-6 py-3 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:text-(--text-primary)"
            >
              View pricing
            </Link>
          </div>
        </Container>
      </section>

      {/* SECTION 5 — FINAL CTA */}
      <section className="border-y border-(--border-subtle) bg-(--bg-surface) py-20">
        <Container className="!py-0">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-(--text-primary) md:text-4xl">
              Your approval process deserves a paper trail.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-(--text-secondary)">
              Join finance and operations teams using Relitrue to close approvals faster, with complete
              audit confidence.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                href={primaryCtaHref}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                {primaryCtaLabel}
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-md border border-(--border-subtle) px-6 py-3 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:text-(--text-primary)"
              >
                View pricing
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <PublicFooter isLoggedIn={isLoggedIn} />
    </main>
  );
}
