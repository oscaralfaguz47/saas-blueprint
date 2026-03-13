import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/* -------------------------------------------------------------------------- */
/*                               Public Landing                               */
/* -------------------------------------------------------------------------- */

export default async function PublicHomePage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <main className="min-h-screen bg-(--bg-main)">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="border-b border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface)">
                <span className="text-xs font-semibold text-(--text-primary)">
                  ATL
                </span>
              </div>

              <span className="text-sm font-medium text-(--text-primary)">
                ATL
              </span>

              <span className="hidden text-sm text-(--text-muted) md:inline">
                Executive approvals, evidence, timeline. UPDATED
              </span>
            </div>

            <nav className="flex items-center gap-3">
              <Link
                href="/pricing"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Pricing
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

              <ButtonLink href="/pricing" variant="secondary">View pricing</ButtonLink>
            </nav>
          </div>
        </Container>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-(--bg-main)">
        <Container>
          <div className="py-16 md:py-20">
            <div className="grid gap-10 md:grid-cols-12 md:items-center">
              <div className="md:col-span-7">
                <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
                  For managers and admin teams
                </p>

                <h1 className="mt-3 text-4xl font-bold leading-tight text-(--text-primary) md:text-5xl">
                  Get external approvals with evidence, timelines, and zero ambiguity.
                </h1>

                <p className="mt-4 max-w-xl text-sm leading-relaxed text-(--text-secondary)">
                  Create a record, attach evidence, send a secure approval link,
                  and keep an audit-ready timeline. Fast setup. No passwords required.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <ButtonLink href={isLoggedIn ? "/app/requests" : "/auth/sign-in"} variant="primary">
                    {isLoggedIn ? "Go to app" : "Get started"}
                  </ButtonLink>
                  <ButtonLink href="/pricing" variant="secondary">View pricing</ButtonLink>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-(--text-muted)">
                  <span>Time-to-value &lt; 5 minutes</span>
                  <span>Tokenized approvals</span>
                  <span>Append-only timeline</span>
                </div>
              </div>

              {/* Data snapshot */}
              <div className="md:col-span-5">
                <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-(--text-primary)">
                      Approval snapshot
                    </p>
                    <span className="rounded-md bg-(--bg-surface-elev) px-2 py-1 text-xs font-medium text-(--text-secondary)">
                      Pending
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
                      <p className="text-xs text-(--text-muted)">Record</p>
                      <p className="mt-1 text-sm font-medium text-(--text-primary)">
                        Scope change — Phase 2 extension
                      </p>
                      <p className="mt-1 text-xs text-(--text-secondary)">
                        Evidence attached • External approver notified
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
                        <p className="text-xs text-(--text-muted)">SLA</p>
                        <p className="mt-1 text-sm font-semibold text-(--text-primary)">
                          7 days
                        </p>
                      </div>

                      <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
                        <p className="text-xs text-(--text-muted)">Last activity</p>
                        <p className="mt-1 text-sm font-semibold text-(--text-primary)">
                          2 hours ago
                        </p>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-(--text-muted)">
                      Built for clear decisions, audit trails, and fast retrieval via search.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How it works                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-(--bg-app)">
        <Container>
          <div className="py-16">
            <h2 className="text-3xl font-semibold text-(--text-primary)">
              How it works
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
              A complete loop designed for speed and clarity.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <Card
                title="1) Create a record"
                description="Capture the decision context with structured fields. Save as draft or send immediately."
              />
              <Card
                title="2) Attach evidence"
                description="Upload files or add links. Everything stays tied to the record."
              />
              <Card
                title="3) External approval"
                description="Send a secure, expiring link. Timeline updates automatically."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Trust & Governance                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-(--bg-main)">
        <Container>
          <div className="py-16">
            <h2 className="text-3xl font-semibold text-(--text-primary)">
              Built for trust and governance
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
              Strong defaults that prevent ambiguity and reduce risk.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <Card
                title="Tokenized external links"
                description="Scoped, expiring, revocable, and non-indexable."
              />
              <Card
                title="Append-only timeline"
                description="An immutable audit trail of every action."
              />
              <Card
                title="Sensitive gating"
                description="Optional extra verification before showing attachments."
              />
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={isLoggedIn ? "/app/requests" : "/auth/sign-in"} variant="primary">
                {isLoggedIn ? "Go to app" : "Get started"}
              </ButtonLink>
              <ButtonLink href="/pricing" variant="secondary">View pricing</ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                             */}
      {/* ------------------------------------------------------------------ */}
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
                href={isLoggedIn ? "/app/requests" : "/auth/sign-in"}
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                {isLoggedIn ? "Go to app" : "Sign in"}
              </Link>
            </div>
          </div>
        </Container>
      </footer>
    </main>
  );
}
