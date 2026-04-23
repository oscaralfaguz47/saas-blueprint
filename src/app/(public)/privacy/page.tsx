import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

const LAST_UPDATED = "2026-02-19"; // update when you change this policy

const PRIVACY_TOC = [
  { n: 1, title: "Who we are (roles)" },
  { n: 2, title: "Information we collect" },
  { n: 3, title: "How we use information" },
  { n: 4, title: "External approvers" },
  { n: 5, title: "Billing and payments (Merchant of Record)" },
  { n: 6, title: "Data retention" },
  { n: 7, title: "Security" },
  { n: 8, title: "International transfers" },
  { n: 9, title: "Your rights" },
  { n: 10, title: "Contact" },
] as const;

function tocNum(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export default async function PrivacyPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <main className="min-h-screen bg-(--marketing-legal-bg)">
      <PublicHeader isLoggedIn={isLoggedIn} />

      <section className="border-b border-(--border-subtle) bg-(--marketing-legal-bg) py-16 md:py-20">
        <MarketingContainer>
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
              <span className="text-xs font-medium text-emerald-400">Privacy Policy</span>
            </div>

            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-emerald-400">Legal</p>

            <h1 className="text-4xl font-bold leading-tight tracking-tight text-(--text-primary) md:text-5xl">
              Privacy Policy
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <span className="text-sm text-(--text-muted)">Last updated: {LAST_UPDATED}</span>
              <span className="text-(--border-subtle)">·</span>
              <span className="text-sm text-(--text-muted)">10 sections</span>
              <span className="text-(--border-subtle)">·</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Current version
              </span>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section className="py-16 md:py-24">
        <MarketingContainer>
          <div className="mx-auto max-w-4xl">
            <div className="flex items-start gap-12">
              <aside className="sticky top-24 hidden w-56 shrink-0 lg:block">
                <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface-elev) p-5">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
                    On this page
                  </p>
                  <nav className="space-y-1">
                    {PRIVACY_TOC.map(({ n, title }) => (
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
                      This Privacy Policy explains how ATL (&quot;we&quot;, &quot;us&quot;) collects, uses, and
                      protects information when you use our B2B SaaS platform (the &quot;Service&quot;).
                    </p>

                    <h2
                      id="section-1"
                      className="mb-0 mt-10 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">1</span>
                      </span>
                      Who we are (roles)
                    </h2>
                    <p>
                      In most cases, our customers (the workspace owner/organization) are the{" "}
                      <strong>data controller</strong> for Customer Content. ATL acts as a <strong>data processor</strong>{" "}
                      and processes Customer Content only to provide and secure the Service.
                    </p>

                    <h2
                      id="section-2"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">2</span>
                      </span>
                      Information we collect
                    </h2>
                    <p>We collect the following categories of information:</p>
                    <ul className="list-disc space-y-3 pl-6 marker:text-emerald-500">
                      <li>
                        <strong>Account and workspace information</strong>: name, email, authentication details,
                        workspace name/settings, role/permissions.
                      </li>
                      <li>
                        <strong>Customer Content</strong>: records, descriptions, metadata, approval requests,
                        comments, and related workflow data you submit to the Service.
                      </li>
                      <li>
                        <strong>Evidence and attachments</strong>: files and links you upload or attach to records
                        (including file metadata such as size and type).
                      </li>
                      <li>
                        <strong>External approver data</strong>: approver email (and optional name) used to deliver
                        approval requests and display the limited content you choose to share.
                      </li>
                      <li>
                        <strong>Usage and security data</strong>: IP address, device/user agent, logs, and audit trails
                        needed for security, fraud prevention, and troubleshooting.
                      </li>
                    </ul>

                    <h2
                      id="section-3"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">3</span>
                      </span>
                      How we use information
                    </h2>
                    <p>We use information to:</p>
                    <ul className="list-disc space-y-3 pl-6 marker:text-emerald-500">
                      <li>Provide, operate, and maintain the Service.</li>
                      <li>Authenticate users, enforce access controls, and prevent abuse.</li>
                      <li>
                        Deliver workflow notifications (e.g., approval emails) and enable audit-ready records and
                        logs.
                      </li>
                      <li>Improve performance, reliability, and user experience.</li>
                      <li>Comply with legal obligations and enforce our terms.</li>
                    </ul>

                    <h2
                      id="section-4"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">4</span>
                      </span>
                      External approvers
                    </h2>
                    <p>
                      External approvers only see information that is explicitly shared with them through secure links.
                      Links are time-limited and may be revoked by internal users. We recommend sharing only the minimum
                      necessary information.
                    </p>

                    <h2
                      id="section-5"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">5</span>
                      </span>
                      Billing and payments (Merchant of Record)
                    </h2>
                    <p>
                      Payments may be processed by a Merchant of Record or payment provider (e.g., Paddle). We do not
                      store full payment card details. Billing providers may collect and process payment information
                      under their own privacy policies.
                    </p>

                    <h2
                      id="section-6"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">6</span>
                      </span>
                      Data retention
                    </h2>
                    <p>
                      We retain Customer Content for as long as your workspace remains active, subject to your plan
                      features and workspace settings. You may delete records and attachments within the Service. After
                      cancellation, we may retain data for a limited period for backup, compliance, and dispute
                      resolution, and then delete or anonymize it in accordance with our retention practices.
                    </p>

                    <h2
                      id="section-7"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">7</span>
                      </span>
                      Security
                    </h2>
                    <p>
                      We implement technical and organizational measures designed to protect your information,
                      including access controls, encryption in transit, and audit logging for sensitive actions. No system
                      is 100% secure, and you are responsible for maintaining the confidentiality of your credentials.
                    </p>

                    <h2
                      id="section-8"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">8</span>
                      </span>
                      International transfers
                    </h2>
                    <p>
                      The Service may process and store data in regions where we and our service providers operate. We
                      use reputable providers and reasonable safeguards for cross-border processing.
                    </p>

                    <h2
                      id="section-9"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">9</span>
                      </span>
                      Your rights
                    </h2>
                    <p>
                      Depending on your location, you may have rights to access, correct, delete, or export personal
                      information. Workspace admins may also manage user access and content within their workspace.
                    </p>

                    <h2
                      id="section-10"
                      className="mb-0 mt-12 flex scroll-mt-28 items-center gap-3 text-xl font-bold text-(--text-primary)"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5">
                        <span className="font-mono text-[9px] font-bold leading-none text-emerald-400">10</span>
                      </span>
                      Contact
                    </h2>
                    <p>
                      Questions about this Privacy Policy?{" "}
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
        </MarketingContainer>
      </section>

      <PublicFooter isLoggedIn={isLoggedIn} />
    </main>
  );
}
