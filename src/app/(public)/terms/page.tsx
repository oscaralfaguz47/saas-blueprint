import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

import { Container } from "@/components/ui/container";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

const LAST_UPDATED = "2026-02-19"; // update when you change these terms

const TERMS_TOC = [
  { n: 1, title: "The Service (B2B SaaS)" },
  { n: 2, title: "Accounts, workspaces, and responsibilities" },
  { n: 3, title: "Customer Content and External Approvers" },
  { n: 4, title: "Acceptable use" },
  { n: 5, title: "Subscriptions, billing, and taxes" },
  { n: 6, title: "Refund Policy" },
  { n: 7, title: "Availability and changes to the Service" },
  { n: 8, title: "Disclaimer" },
  { n: 9, title: "Limitation of liability" },
  { n: 10, title: "Termination" },
  { n: 11, title: "Contact" },
] as const;

function tocNum(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export default async function TermsPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <main className="min-h-screen bg-(--marketing-legal-bg)">
      <PublicHeader isLoggedIn={isLoggedIn} />

      <section className="border-b border-(--border-subtle) bg-(--marketing-legal-bg) py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center gap-2">
              <Link
                href="/"
                className="text-xs text-(--text-muted) transition-colors hover:text-(--text-primary)"
              >
                Relitrue
              </Link>
              <span className="text-xs text-(--text-muted)">/</span>
              <span className="text-xs text-(--text-muted)">Legal</span>
              <span className="text-xs text-(--text-muted)">/</span>
              <span className="text-xs font-medium text-emerald-400">Terms of Service</span>
            </div>

            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-emerald-400">Legal</p>

            <h1 className="text-4xl font-bold leading-tight tracking-tight text-(--text-primary) md:text-5xl">
              Terms of Service
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <span className="text-sm text-(--text-muted)">Last updated: {LAST_UPDATED}</span>
              <span className="text-(--border-subtle)">·</span>
              <span className="text-sm text-(--text-muted)">11 sections</span>
              <span className="text-(--border-subtle)">·</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Current version
              </span>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-4xl">
            <div className="flex items-start gap-12">
              <aside className="sticky top-24 hidden w-56 shrink-0 lg:block">
                <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface-elev) p-5">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
                    On this page
                  </p>
                  <nav className="space-y-1">
                    {TERMS_TOC.map(({ n, title }) => (
                      <a
                        key={n}
                        href={`#section-${n}`}
                        className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-(--text-secondary) transition-all hover:bg-(--bg-surface) hover:text-(--text-primary)"
                      >
                        <span className="w-4 shrink-0 font-mono text-[10px] text-(--text-muted) group-hover:text-emerald-400">
                          {tocNum(n)}
                        </span>
                        {title}
                      </a>
                    ))}
                  </nav>
                  <div className="mt-6 border-t border-(--border-subtle) pt-4">
                    <Link
                      href="/"
                      className="flex items-center gap-1.5 text-xs text-(--text-muted) transition-colors hover:text-emerald-400"
                    >
                      ← Back to home
                    </Link>
                  </div>
                </div>
              </aside>

              <div className="min-w-0 flex-1">
                <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8 md:p-12">
                  <div className="space-y-8 text-base leading-relaxed text-(--text-secondary)">
                    <p>
                      These Terms of Service (&quot;Terms&quot;) govern your access to and use of ATL (the
                      &quot;Service&quot;). By creating an account, accessing, or using the Service, you agree to
                      these Terms.
                    </p>

                    <h2
                      id="section-1"
                      className="mb-0 mt-10 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">1</span>
                      </span>
                      The Service (B2B SaaS)
                    </h2>
                    <p>
                      ATL is a subscription-based B2B SaaS platform that helps organizations manage internal approval
                      workflows, attach supporting evidence, and maintain audit-ready documentation and logs. The
                      Service does not process payments on your behalf, hold funds, or provide financial services.
                    </p>

                    <h2
                      id="section-2"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">2</span>
                      </span>
                      Accounts, workspaces, and responsibilities
                    </h2>
                    <p>
                      You are responsible for all activity under your account and within your workspace(s), including
                      user access, permissions, and content you upload or share. You must use the Service in compliance
                      with applicable laws and these Terms.
                    </p>

                    <h2
                      id="section-3"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">3</span>
                      </span>
                      Customer Content and External Approvers
                    </h2>
                    <p>
                      You retain ownership of your content (records, attachments, and other materials) submitted to the
                      Service (&quot;Customer Content&quot;). External approvers may receive secure, tokenized links that
                      show only the information you choose to share. You are responsible for ensuring recipients are
                      authorized to view shared information.
                    </p>

                    <h2
                      id="section-4"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">4</span>
                      </span>
                      Acceptable use
                    </h2>
                    <p>
                      You agree not to misuse the Service, including attempting unauthorized access, probing or scanning
                      security, uploading malicious files, or using the Service in a way that violates laws or
                      third-party rights. We may suspend or terminate access to protect the Service, users, and third
                      parties.
                    </p>

                    <h2
                      id="section-5"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">5</span>
                      </span>
                      Subscriptions, billing, and taxes
                    </h2>
                    <p>
                      Paid plans are billed in advance on a recurring basis (e.g., monthly). Subscription fees,
                      applicable taxes, and billing details are presented at checkout. Billing may be handled by a
                      Merchant of Record/payment provider (e.g., Paddle), which may calculate and collect taxes and
                      provide invoices/receipts under its policies.
                    </p>
                    <ul className="list-disc space-y-3 pl-6 marker:text-emerald-500">
                      <li>
                        <strong>Auto-renewal:</strong> Your subscription renews automatically unless you cancel before
                        the end of the current billing period.
                      </li>
                      <li>
                        <strong>Cancellation:</strong> You can cancel at any time from your workspace billing settings.
                        Cancellation takes effect at the end of the current billing period unless otherwise stated at
                        checkout.
                      </li>
                      <li>
                        <strong>Plan changes:</strong> Upgrades/downgrades may take effect immediately or at the next
                        billing period depending on the plan and provider rules.
                      </li>
                    </ul>

                    <h2
                      id="section-6"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">6</span>
                      </span>
                      Refund Policy
                    </h2>
                    <p>
                      Unless required by law or explicitly stated at checkout, fees for subscription periods are
                      generally <strong>non-refundable</strong>. If you believe you were billed in error, please contact
                      us within <strong>14 days</strong> of the charge and we will review the request. Approved refunds
                      (if any) will be processed via the original payment method and may take several business days to
                      appear, depending on your bank/payment provider.
                    </p>
                    <p>
                      If billing is handled by a Merchant of Record (e.g., Paddle), refunds may be subject to that
                      provider’s refund and dispute policies and processing timelines.
                    </p>

                    <h2
                      id="section-7"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">7</span>
                      </span>
                      Availability and changes to the Service
                    </h2>
                    <p>
                      We may modify, update, or discontinue features of the Service. We strive to provide a reliable
                      service, but we do not guarantee uninterrupted availability.
                    </p>

                    <h2
                      id="section-8"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">8</span>
                      </span>
                      Disclaimer
                    </h2>
                    <p>
                      The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum
                      extent permitted by law, we disclaim all warranties, express or implied, including merchantability,
                      fitness for a particular purpose, and non-infringement.
                    </p>

                    <h2
                      id="section-9"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">9</span>
                      </span>
                      Limitation of liability
                    </h2>
                    <p>
                      To the maximum extent permitted by law, ATL will not be liable for any indirect, incidental,
                      special, consequential, or punitive damages, or any loss of profits, revenues, data, or goodwill,
                      arising out of or related to your use of the Service.
                    </p>

                    <h2
                      id="section-10"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">10</span>
                      </span>
                      Termination.
                    </h2>
                    <p>
                      You may stop using the Service at any time. We may suspend or terminate access if you violate these
                      Terms, pose a security risk, or if required by law. Upon termination, your access may end, and your
                      data may be handled according to our Privacy Policy and retention practices.
                    </p>

                    <h2
                      id="section-11"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">11</span>
                      </span>
                      Contact
                    </h2>
                    <p>
                      Questions about these Terms?{" "}
                      <Link
                        href="/help"
                        className="font-medium text-emerald-400 transition-colors hover:text-emerald-300"
                      >
                        Contact our support team →
                      </Link>
                    </p>
                  </div>

                  <div className="mt-16 flex flex-col gap-4 border-t border-(--border-subtle) pt-8 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-(--text-muted)">Last updated: {LAST_UPDATED}</p>
                    <Link
                      href="/help"
                      className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300"
                    >
                      Questions? Contact us →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <PublicFooter isLoggedIn={isLoggedIn} />
    </main>
  );
}
