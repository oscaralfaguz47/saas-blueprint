// app/privacy/page.tsx (or wherever your route lives)
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

const LAST_UPDATED = "2026-02-19"; // update when you change this policy

export default async function PrivacyPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <main
      className="min-h-screen bg-(--marketing-legal-bg)"
      style={{ backgroundColor: "var(--marketing-legal-bg, #0f1117)" }}
    >
      {/* Header */}
      <header
        className="border-b border-(--border-subtle) bg-(--bg-main)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
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
            </div>
            <nav className="flex items-center gap-3">
              <Link
                href="/"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
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
                href={isLoggedIn ? "/app/requests" : "/auth/sign-in"}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                {isLoggedIn ? "Go to app" : "Sign in"}
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {/* Content */}
      <section className="py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-3xl rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8 shadow-sm md:p-12">
            <h1 className="text-3xl font-semibold text-(--text-primary) md:text-4xl">
              Privacy Policy
            </h1>

            <p className="mt-4 text-sm text-(--text-muted)">
              Last updated: {LAST_UPDATED}
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-(--text-secondary)">
              <p>
                This Privacy Policy explains how ATL (&quot;we&quot;,
                &quot;us&quot;) collects, uses, and protects information when you
                use our B2B SaaS platform (the &quot;Service&quot;).
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                1. Who we are (roles)
              </h2>
              <p>
                In most cases, our customers (the workspace owner/organization)
                are the <strong>data controller</strong> for Customer Content.
                ATL acts as a <strong>data processor</strong> and processes
                Customer Content only to provide and secure the Service.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                2. Information we collect
              </h2>
              <p>
                We collect the following categories of information:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Account and workspace information</strong>: name,
                  email, authentication details, workspace name/settings,
                  role/permissions.
                </li>
                <li>
                  <strong>Customer Content</strong>: records, descriptions,
                  metadata, approval requests, comments, and related workflow
                  data you submit to the Service.
                </li>
                <li>
                  <strong>Evidence and attachments</strong>: files and links you
                  upload or attach to records (including file metadata such as
                  size and type).
                </li>
                <li>
                  <strong>External approver data</strong>: approver email (and
                  optional name) used to deliver approval requests and display
                  the limited content you choose to share.
                </li>
                <li>
                  <strong>Usage and security data</strong>: IP address,
                  device/user agent, logs, and audit trails needed for security,
                  fraud prevention, and troubleshooting.
                </li>
              </ul>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                3. How we use information
              </h2>
              <p>
                We use information to:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Provide, operate, and maintain the Service.</li>
                <li>
                  Authenticate users, enforce access controls, and prevent abuse.
                </li>
                <li>
                  Deliver workflow notifications (e.g., approval emails) and
                  enable audit-ready records and logs.
                </li>
                <li>
                  Improve performance, reliability, and user experience.
                </li>
                <li>
                  Comply with legal obligations and enforce our terms.
                </li>
              </ul>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                4. External approvers
              </h2>
              <p>
                External approvers only see information that is explicitly
                shared with them through secure links. Links are time-limited
                and may be revoked by internal users. We recommend sharing only
                the minimum necessary information.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                5. Billing and payments (Merchant of Record)
              </h2>
              <p>
                Payments may be processed by a Merchant of Record or payment
                provider (e.g., Paddle). We do not store full payment card
                details. Billing providers may collect and process payment
                information under their own privacy policies.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                6. Data retention
              </h2>
              <p>
                We retain Customer Content for as long as your workspace remains
                active, subject to your plan features and workspace settings.
                You may delete records and attachments within the Service.
                After cancellation, we may retain data for a limited period for
                backup, compliance, and dispute resolution, and then delete or
                anonymize it in accordance with our retention practices.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                7. Security
              </h2>
              <p>
                We implement technical and organizational measures designed to
                protect your information, including access controls, encryption
                in transit, and audit logging for sensitive actions. No system
                is 100% secure, and you are responsible for maintaining the
                confidentiality of your credentials.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                8. International transfers
              </h2>
              <p>
                The Service may process and store data in regions where we and
                our service providers operate. We use reputable providers and
                reasonable safeguards for cross-border processing.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                9. Your rights
              </h2>
              <p>
                Depending on your location, you may have rights to access,
                correct, delete, or export personal information. Workspace
                admins may also manage user access and content within their
                workspace.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                10. Contact
              </h2>
              <p>
                If you have questions about this Privacy Policy, contact us at{" "}
                <strong>privacy@PENDING_DOMAIN.com</strong>.
              </p>

            </div>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer
        className="border-t border-(--border-subtle) bg-(--bg-main)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
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
                href="/pricing"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Pricing
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
