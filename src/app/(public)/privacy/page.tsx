// app/privacy/page.tsx (or wherever your route lives)
import Link from "next/link";
import { Container } from "@/components/ui/container";

const LAST_UPDATED = "2026-02-19"; // update when you change this policy

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      {/* Header */}
      <header className="border-b border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="text-sm font-medium text-(--text-primary)">
              ATL
            </Link>

            <nav className="flex items-center gap-6 text-sm">
              <Link
                href="/pricing"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Pricing
              </Link>
              <Link
                href="/terms"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Terms
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Sign in
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {/* Content */}
      <section>
        <Container>
          <div className="py-16 max-w-3xl">
            <h1 className="text-3xl font-semibold text-(--text-primary)">
              Privacy Policy
            </h1>

            <p className="mt-4 text-sm text-(--text-muted)">
              Last updated: {LAST_UPDATED}
            </p>

            <div className="mt-8 space-y-6 text-sm leading-relaxed text-(--text-secondary)">
              <p>
                This Privacy Policy explains how ATL (&quot;we&quot;,
                &quot;us&quot;) collects, uses, and protects information when you
                use our B2B SaaS platform (the &quot;Service&quot;).
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                1. Who we are (roles)
              </h2>
              <p>
                In most cases, our customers (the workspace owner/organization)
                are the <strong>data controller</strong> for Customer Content.
                ATL acts as a <strong>data processor</strong> and processes
                Customer Content only to provide and secure the Service.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
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

              <h2 className="text-base font-semibold text-(--text-primary)">
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

              <h2 className="text-base font-semibold text-(--text-primary)">
                4. External approvers
              </h2>
              <p>
                External approvers only see information that is explicitly
                shared with them through secure links. Links are time-limited
                and may be revoked by internal users. We recommend sharing only
                the minimum necessary information.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                5. Billing and payments (Merchant of Record)
              </h2>
              <p>
                Payments may be processed by a Merchant of Record or payment
                provider (e.g., Paddle). We do not store full payment card
                details. Billing providers may collect and process payment
                information under their own privacy policies.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
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

              <h2 className="text-base font-semibold text-(--text-primary)">
                7. Security
              </h2>
              <p>
                We implement technical and organizational measures designed to
                protect your information, including access controls, encryption
                in transit, and audit logging for sensitive actions. No system
                is 100% secure, and you are responsible for maintaining the
                confidentiality of your credentials.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                8. International transfers
              </h2>
              <p>
                The Service may process and store data in regions where we and
                our service providers operate. We use reputable providers and
                reasonable safeguards for cross-border processing.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                9. Your rights
              </h2>
              <p>
                Depending on your location, you may have rights to access,
                correct, delete, or export personal information. Workspace
                admins may also manage user access and content within their
                workspace.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
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
      <footer className="border-t border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="py-8 text-sm text-(--text-muted)">
            © {new Date().getFullYear()} ATL. All rights reserved.
          </div>
        </Container>
      </footer>
    </main>
  );
}
